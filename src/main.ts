import './style.css';
import { default as toWebVTT } from 'srt-webvtt';

const subtitleInput = document.getElementById(
  'subtitle-input'
) as HTMLInputElement;
const captionTrack = document.getElementById(
  'caption-track'
) as HTMLTrackElement;
const video = document.getElementById('video') as HTMLVideoElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const customCaptionsContainer = document.getElementById(
  'custom-captions'
) as HTMLDivElement;
const captionToggleBtn = document.getElementById(
  'caption-toggle'
) as HTMLButtonElement;
const trackSelector = document.getElementById(
  'track-selector'
) as HTMLSelectElement;
const trackSelectorContainer = document.getElementById(
  'track-selector-container'
) as HTMLDivElement;

let captionsEnabled = true;
let previousVideoURL: any = null;
let uploadedSubtitlesTracks: { [key: string]: string } = {};
let activeTrackIndex: number = -1;
let debugMode = true; // Enable debugging
let isProcessingTrackSelection = false; // Flag to prevent recursive track selection

// Debugging helper
function debug(...args: any[]) {
  if (debugMode) {
    console.log('[Vidum Debug]', ...args);
  }
}

fileInput?.addEventListener('change', async (event: any) => {
  const file = event.target?.files?.[0];
  if (file) {
    const videoURL = URL.createObjectURL(file);

    if (previousVideoURL) {
      URL.revokeObjectURL(previousVideoURL);
    }

    // Reset track selector and uploadedSubtitlesTracks when loading a new video
    resetTrackSelector();

    video.controls = true;
    video.style.display = 'block';

    // Fix the infinite loop by using a safer approach to clear child elements
    // Remove all children except the captionTrack
    const children = Array.from(video.children);
    children.forEach((child) => {
      if (child !== captionTrack) {
        video.removeChild(child);
      }
    });

    debug('Loading video:', file.name);
    video.src = videoURL;

    // Make sure we wait for metadata before checking for tracks
    video.addEventListener(
      'loadedmetadata',
      () => {
        debug('Video metadata loaded, checking for embedded tracks...');
        // Wait a bit for tracks to initialize - try multiple times
        setTimeout(() => {
          checkForEmbeddedTracks();

          // Sometimes tracks take longer to load, so check again after a longer delay
          setTimeout(() => {
            if (trackSelector.querySelectorAll('option').length <= 1) {
              // Only "No subtitles" option
              debug('Second attempt at checking for embedded tracks...');
              checkForEmbeddedTracks();
            }
          }, 2000);
        }, 500);
      },
      { once: true }
    );

    // Also check once the video has started playing as some tracks appear only then
    video.addEventListener(
      'playing',
      () => {
        debug('Video started playing, checking for additional tracks...');
        if (trackSelector.querySelectorAll('option').length <= 1) {
          checkForEmbeddedTracks();
        }
      },
      { once: true }
    );

    // Hide the 'no video selected' screen
    const noVideoSelectedDiv = document.getElementById('no-video-selected');
    if (noVideoSelectedDiv) {
      noVideoSelectedDiv.style.display = 'none';
    }

    video.play();
    previousVideoURL = videoURL;
  }
});

subtitleInput?.addEventListener('change', async () => {
  const file = subtitleInput?.files?.[0];
  if (!file) {
    return;
  }
  try {
    debug('Loading external subtitle file:', file.name);
    const textTrackUrl = await toWebVTT(file);

    // Add the uploaded subtitle to the list
    const fileName = file.name.replace('.srt', '');
    const trackId = `uploaded-${Date.now()}`;
    uploadedSubtitlesTracks[trackId] = textTrackUrl;

    // Add to track selector
    addTrackOption(fileName, trackId);

    // Automatically select this track
    trackSelector.value = trackId;
    selectTrack(trackId);

    showTrackSelector();
  } catch (e: any) {
    console.error('Error loading subtitle file:', e.message);
  }
});

/**
 * Check if the video has embedded subtitle tracks
 */
function checkForEmbeddedTracks() {
  const textTracks = video.textTracks;
  debug(`Found ${textTracks.length} text tracks in video`);

  let hasEmbeddedTracks = false;

  if (textTracks.length > 0) {
    // First, log what tracks we found
    for (let i = 0; i < textTracks.length; i++) {
      debug(`Track ${i}:`, {
        kind: textTracks[i].kind,
        label: textTracks[i].label,
        language: textTracks[i].language,
        mode: textTracks[i].mode,
        id: textTracks[i].id,
        cues: textTracks[i].cues ? textTracks[i].cues?.length : 'none',
      });
    }

    // Set all tracks to showing to force loading of cues, but with a longer timeout
    // This is critical for embedded subtitles to load properly
    for (let i = 0; i < textTracks.length; i++) {
      textTracks[i].mode = 'showing';
    }

    // Then after a longer delay to ensure cues are properly loaded, process tracks
    setTimeout(() => {
      // Now look for subtitle tracks and add them to the selector
      for (let i = 0; i < textTracks.length; i++) {
        const track = textTracks[i];

        // Don't hide tracks yet - this is key for embedded subtitles
        // We'll hide them individually when we select a specific track

        // Consider all track kinds that might contain subtitles
        if (
          track.kind === 'subtitles' ||
          track.kind === 'captions' ||
          track.kind === 'chapters' ||
          track.kind === 'descriptions' ||
          track.kind === 'metadata'
        ) {
          hasEmbeddedTracks = true;

          // Check if we already added this track to avoid duplicates
          const existingOption = trackSelector.querySelector(
            `option[value="embedded-${i}"]`
          );
          if (existingOption) {
            continue;
          }

          // Log more details about available cues for debugging
          if (track.cues) {
            debug(
              `Track ${i} has ${track.cues.length} cues. First few cues:`,
              Array.from(track.cues)
                .slice(0, 3)
                .map((cue) => ({
                  text: (cue as VTTCue).text,
                  startTime: cue.startTime,
                  endTime: cue.endTime,
                }))
            );
          }

          // Add embedded track to selector
          const label =
            track.label ||
            (track.language
              ? `${track.language} - ${track.kind}`
              : `Track ${i + 1} (${track.kind})`);
          addTrackOption(label, `embedded-${i}`);

          debug(`Added embedded track "${label}" at index ${i}`);
        }
      }

      if (hasEmbeddedTracks) {
        showTrackSelector();
        captionToggleBtn.disabled = false;

        // Select the first track by default, but with a guard for infinite loops
        if (!isProcessingTrackSelection) {
          const firstTrackOption = trackSelector.querySelector(
            'option[value^="embedded-"]'
          ) as HTMLOptionElement;
          if (firstTrackOption) {
            trackSelector.value = firstTrackOption.value;
            selectTrack(firstTrackOption.value);
            debug(
              'Auto-selected first embedded track:',
              firstTrackOption.value
            );
          }
        }
      } else {
        debug('No embedded tracks found');
      }
    }, 500); // Increased timeout to ensure cues load properly
  }
}

/**
 * Add a track option to the selector dropdown
 */
function addTrackOption(label: string, value: string) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  trackSelector.appendChild(option);
}

/**
 * Show the track selector dropdown
 */
function showTrackSelector() {
  trackSelectorContainer.classList.remove('hidden');
}

/**
 * Reset the track selector when loading a new video
 */
function resetTrackSelector() {
  // Keep only the "No subtitles" option
  trackSelector.innerHTML = '<option value="none">No subtitles</option>';
  trackSelectorContainer.classList.add('hidden');
  uploadedSubtitlesTracks = {};
  activeTrackIndex = -1;
  captionToggleBtn.disabled = true;
}

/**
 * Select a track by its ID
 */
function selectTrack(trackId: string) {
  // Guard against recursive calls
  if (isProcessingTrackSelection) {
    debug('Already processing a track selection, skipping');
    return;
  }

  isProcessingTrackSelection = true;
  debug('Selecting track:', trackId);

  // Hide all existing tracks first
  for (let i = 0; i < video.textTracks.length; i++) {
    video.textTracks[i].mode = 'hidden';
  }

  if (trackId === 'none') {
    // No track selected
    activeTrackIndex = -1;
    customCaptionsContainer.style.display = 'none';
    captionToggleBtn.disabled = true;
    debug('Disabled captions');
    isProcessingTrackSelection = false;
    return;
  }

  captionToggleBtn.disabled = false;

  if (trackId.startsWith('embedded-')) {
    // Handle embedded tracks
    const index = parseInt(trackId.replace('embedded-', ''));
    activeTrackIndex = index;

    debug(`Selected embedded track at index ${index}`);

    // Get the track
    const track = video.textTracks[index];

    // IMPORTANT FIX: Force the track to showing mode first to ensure cues are loaded
    track.mode = 'showing';

    // Give it a short delay to ensure the cues are properly loaded
    setTimeout(() => {
      // After ensuring cues are loaded, set up our custom display
      debug(`Track ${index} has ${track.cues ? track.cues.length : 0} cues`);

      // We'll keep the track in showing mode but use CSS to hide native display
      setupCustomCaptions(index);

      // Show our custom container
      if (captionsEnabled) {
        customCaptionsContainer.style.display = 'block';
      }

      isProcessingTrackSelection = false;
    }, 500); // Increased delay to ensure cues are loaded
  } else if (trackId.startsWith('uploaded-')) {
    // Handle uploaded tracks
    const trackUrl = uploadedSubtitlesTracks[trackId];
    if (trackUrl) {
      debug('Selected uploaded track:', trackId);
      captionTrack.src = trackUrl;
      activeTrackIndex = 0; // Custom track is always the first one

      // We need to wait for the track to load
      const trackLoadListener = function onTrackLoad() {
        debug('Uploaded track loaded');

        // Force the track to showing mode
        video.textTracks[0].mode = 'showing';

        // Then set up our custom display
        setupCustomCaptions(0);
        captionTrack.removeEventListener('load', onTrackLoad);
        isProcessingTrackSelection = false;
      };

      captionTrack.addEventListener('load', trackLoadListener);

      // If the load event doesn't fire, set up anyway after a short delay
      setTimeout(() => {
        if (activeTrackIndex === 0 && isProcessingTrackSelection) {
          debug('Track load timed out, setting up captions anyway');
          video.textTracks[0].mode = 'showing';
          setupCustomCaptions(0);
          isProcessingTrackSelection = false;
        }
      }, 500);
    } else {
      isProcessingTrackSelection = false;
    }
  } else {
    isProcessingTrackSelection = false;
  }
}

/**
 * Setup custom captions display for a specific track index
 */
function setupCustomCaptions(trackIndex: number) {
  debug(`Setting up custom captions for track index ${trackIndex}`);

  if (!customCaptionsContainer.querySelector('.custom-captions-text')) {
    const captionsTextElement = document.createElement('div');
    captionsTextElement.className = 'custom-captions-text';
    customCaptionsContainer.appendChild(captionsTextElement);
  }

  const textTrack = video.textTracks[trackIndex];

  // Log detailed track info
  debug('Text track info:', {
    kind: textTrack.kind,
    label: textTrack.label,
    mode: textTrack.mode,
    cues: textTrack.cues ? textTrack.cues.length : 0,
  });

  // Sample some cues if they exist
  if (textTrack.cues && textTrack.cues.length > 0) {
    debug(
      'Sample cues from this track:',
      Array.from(textTrack.cues)
        .slice(0, 3)
        .map((cue) => ({
          text: (cue as VTTCue).text,
          startTime: cue.startTime,
          endTime: cue.endTime,
        }))
    );
  }

  // Remove any existing cuechange listeners to avoid duplicates
  for (let i = 0; i < video.textTracks.length; i++) {
    video.textTracks[i].removeEventListener('cuechange', updateCustomCaptions);
  }

  // Add listener to the selected track - use named function to ensure we can remove it later
  textTrack.addEventListener('cuechange', updateCustomCaptions);
  debug(`Added cuechange listener to track ${trackIndex}`);

  // Make sure captions are initially visible if enabled
  toggleCaptionsVisibility(captionsEnabled);

  // CRITICAL FIX: Always keep the track mode as 'showing' for both captions and subtitles
  // Our CSS will hide native captions but the mode needs to be 'showing' for cuechange events
  textTrack.mode = 'showing';
  debug(`Set track ${trackIndex} mode to 'showing' for cue events to fire`);
}

function updateCustomCaptions() {
  if (activeTrackIndex === -1) return;

  const textTrack = video.textTracks[activeTrackIndex];
  const captionsTextElement = customCaptionsContainer.querySelector(
    '.custom-captions-text'
  ) as HTMLDivElement;

  if (textTrack && textTrack.activeCues && textTrack.activeCues.length > 0) {
    const cue = textTrack.activeCues[0] as VTTCue;

    // Handle different cue text formats - some embedded subtitles use the 'text' property differently
    let cueText = '';

    if (typeof cue.text === 'string' && cue.text.trim() !== '') {
      cueText = cue.text;
    } else if (cue.getCueAsHTML) {
      // Some browsers/formats require getCueAsHTML
      const cueHTML = cue.getCueAsHTML();
      cueText = cueHTML.textContent || '';
    }

    // FIX: Add more debugging to understand cue content
    debug('Processing cue:', {
      text: cueText,
      hasText: typeof cue.text === 'string',
      textLength: typeof cue.text === 'string' ? cue.text.length : 0,
      hasGetCueAsHTML: typeof cue.getCueAsHTML === 'function',
      startTime: cue.startTime.toFixed(2),
      endTime: cue.endTime.toFixed(2),
      currentTime: video.currentTime.toFixed(2),
    });

    // Only display if we have actual text
    if (cueText.trim() !== '') {
      captionsTextElement.innerHTML = cueText;
      customCaptionsContainer.classList.remove('captions-hidden');

      // Make sure the container is visible
      if (captionsEnabled) {
        customCaptionsContainer.style.display = 'block';
      }
    } else {
      customCaptionsContainer.classList.add('captions-hidden');
    }
  } else {
    customCaptionsContainer.classList.add('captions-hidden');
  }
}

function toggleCaptionsVisibility(visible: boolean) {
  captionsEnabled = visible;

  if (visible) {
    customCaptionsContainer.style.display = 'block';
    customCaptionsContainer.classList.remove('captions-hidden');
    // Update caption text immediately when toggling on
    if (activeTrackIndex !== -1) {
      updateCustomCaptions();
    }
  } else {
    customCaptionsContainer.style.display = 'none';
  }

  // Update button text
  captionToggleBtn.textContent = captionsEnabled
    ? 'Hide Captions'
    : 'Show Captions';
}

captionToggleBtn.addEventListener('click', () => {
  captionsEnabled = !captionsEnabled;
  toggleCaptionsVisibility(captionsEnabled);
  captionToggleBtn.textContent = captionsEnabled
    ? 'Hide Captions'
    : 'Show Captions';
});

// Track selector change event
trackSelector.addEventListener('change', () => {
  selectTrack(trackSelector.value);
});

// Debug panel functionality
const debugToggleBtn = document.getElementById(
  'debug-toggle'
) as HTMLButtonElement;
const debugPanel = document.getElementById('debug-panel') as HTMLDivElement;
const debugOutput = document.getElementById('debug-output') as HTMLPreElement;

// Limit debug output to prevent performance issues
let lastDebugUpdateTime = 0;
const DEBUG_THROTTLE_MS = 100; // Limit updates to once per 100ms

// Override console.log when debug mode is enabled - with safeguards
const originalConsoleLog = console.log;
console.log = function (...args) {
  originalConsoleLog.apply(console, args);

  if (args[0] === '[Vidum Debug]' && debugOutput) {
    // Throttle debug updates to prevent UI update loops
    const now = Date.now();
    if (now - lastDebugUpdateTime > DEBUG_THROTTLE_MS) {
      lastDebugUpdateTime = now;

      const logMessage = args
        .slice(1)
        .map((arg) => {
          return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg;
        })
        .join(' ');

      // Append log but keep a reasonable buffer size
      const maxLines = 100;
      const lines = debugOutput.innerHTML.split('\n');
      if (lines.length > maxLines) {
        lines.splice(0, lines.length - maxLines);
        debugOutput.innerHTML = lines.join('\n');
      }

      debugOutput.innerHTML += `${new Date().toISOString().split('T')[1].split('.')[0]} - ${logMessage}\n`;
      debugOutput.scrollTop = debugOutput.scrollHeight;
    }
  }
};

debugToggleBtn.addEventListener('click', () => {
  debugPanel.classList.toggle('hidden');
  if (!debugPanel.classList.contains('hidden')) {
    debugOutput.innerHTML = 'Debug information will appear here...\n';
  }
});
