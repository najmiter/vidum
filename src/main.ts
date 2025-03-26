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

let captionsEnabled = true;
let previousVideoURL: any = null;

fileInput?.addEventListener('change', async (event: any) => {
  const file = event.target?.files?.[0];
  if (file) {
    const videoURL = URL.createObjectURL(file);

    if (previousVideoURL) {
      URL.revokeObjectURL(previousVideoURL);
    }

    video.controls = true;
    video.style.display = 'block';
    video.src = videoURL;
    video.play();
    const noVideoSelectedDiv = document.getElementById('no-video-selected');
    if (noVideoSelectedDiv) {
      noVideoSelectedDiv.style.display = 'none';
    }
    previousVideoURL = videoURL;
  }
});

subtitleInput?.addEventListener('change', async () => {
  const file = subtitleInput?.files?.[0];
  if (!file) {
    return;
  }
  try {
    const textTrackUrl = await toWebVTT(file);
    captionTrack.src = textTrackUrl;

    // Instead of showing default captions, we'll use our custom display
    video.textTracks[0].mode = 'hidden'; // 'hidden' instead of 'showing'

    captionToggleBtn.disabled = false;
    setupCustomCaptions();
  } catch (e: any) {
    console.error(e.message);
  }
});

/**
 * Sets up the custom captions display
 */
function setupCustomCaptions() {
  // Create text element for captions if it doesn't exist
  if (!customCaptionsContainer.querySelector('.custom-captions-text')) {
    const captionsTextElement = document.createElement('div');
    captionsTextElement.className = 'custom-captions-text';
    customCaptionsContainer.appendChild(captionsTextElement);
  }

  const textTrack = video.textTracks[0];

  // Update custom captions when cues change
  textTrack.addEventListener('cuechange', updateCustomCaptions);

  // Initial state of captions visibility
  toggleCaptionsVisibility(captionsEnabled);
}

/**
 * Updates the custom captions with the current active cue text
 */
function updateCustomCaptions() {
  const textTrack = video.textTracks[0];
  const captionsTextElement = customCaptionsContainer.querySelector(
    '.custom-captions-text'
  ) as HTMLDivElement;

  if (textTrack.activeCues && textTrack.activeCues.length > 0) {
    // Get the first active cue
    const cue = textTrack.activeCues[0] as VTTCue;
    // Update the text content
    captionsTextElement.innerHTML = cue.text;
    // Make sure container is visible (if captions are enabled)
    customCaptionsContainer.classList.remove('captions-hidden');
  } else {
    // No active cues, hide the container
    customCaptionsContainer.classList.add('captions-hidden');
  }
}

/**
 * Toggles the visibility of captions
 */
function toggleCaptionsVisibility(visible: boolean) {
  captionsEnabled = visible;

  if (visible) {
    customCaptionsContainer.style.display = 'block';
  } else {
    customCaptionsContainer.style.display = 'none';
  }
}

// Toggle captions button event listener
captionToggleBtn.addEventListener('click', () => {
  captionsEnabled = !captionsEnabled;
  toggleCaptionsVisibility(captionsEnabled);
  captionToggleBtn.textContent = captionsEnabled
    ? 'Hide Captions'
    : 'Show Captions';
});
