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

let captionsEnabled = true;
let previousVideoURL: any = null;
let uploadedSubtitlesTracks: { [key: string]: string } = {};
let activeTrackIndex: number = -1;
let isProcessingTrackSelection = false;

fileInput?.addEventListener('change', async (event: any) => {
  const file = event.target?.files?.[0];
  if (file) {
    const videoURL = URL.createObjectURL(file);

    if (previousVideoURL) {
      URL.revokeObjectURL(previousVideoURL);
    }

    resetTrackSelector();

    video.controls = true;
    video.style.display = 'block';

    const children = Array.from(video.children);
    children.forEach((child) => {
      if (child !== captionTrack) {
        video.removeChild(child);
      }
    });

    video.src = videoURL;

    video.addEventListener('loadedmetadata', () => {}, { once: true });

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
    const textTrackUrl = await toWebVTT(file);

    const fileName = file.name.replace('.srt', '');
    const trackId = `uploaded-${Date.now()}`;
    uploadedSubtitlesTracks[trackId] = textTrackUrl;

    addTrackOption(fileName, trackId);

    selectTrack(trackId);
  } catch (e: any) {}
});

function addTrackOption(label: string, value: string) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
}

function resetTrackSelector() {
  uploadedSubtitlesTracks = {};
  activeTrackIndex = -1;
}

function selectTrack(trackId: string) {
  if (isProcessingTrackSelection) {
    return;
  }

  isProcessingTrackSelection = true;

  for (let i = 0; i < video.textTracks.length; i++) {
    video.textTracks[i].mode = 'hidden';
  }

  if (trackId === 'none') {
    activeTrackIndex = -1;
    customCaptionsContainer.style.display = 'none';

    isProcessingTrackSelection = false;
    return;
  }

  if (trackId.startsWith('embedded-')) {
    const index = parseInt(trackId.replace('embedded-', ''));
    activeTrackIndex = index;

    const track = video.textTracks[index];

    track.mode = 'showing';

    setTimeout(() => {
      setupCustomCaptions(index);

      if (captionsEnabled) {
        customCaptionsContainer.style.display = 'block';
      }

      isProcessingTrackSelection = false;
    }, 500);
  } else if (trackId.startsWith('uploaded-')) {
    const trackUrl = uploadedSubtitlesTracks[trackId];
    if (trackUrl) {
      captionTrack.src = trackUrl;
      activeTrackIndex = 0;

      const trackLoadListener = function onTrackLoad() {
        video.textTracks[0].mode = 'showing';

        setupCustomCaptions(0);
        captionTrack.removeEventListener('load', onTrackLoad);
        isProcessingTrackSelection = false;
      };

      captionTrack.addEventListener('load', trackLoadListener);

      setTimeout(() => {
        if (activeTrackIndex === 0 && isProcessingTrackSelection) {
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

function setupCustomCaptions(trackIndex: number) {
  if (!customCaptionsContainer.querySelector('.custom-captions-text')) {
    const captionsTextElement = document.createElement('div');
    captionsTextElement.className = 'custom-captions-text';
    customCaptionsContainer.appendChild(captionsTextElement);
  }

  const textTrack = video.textTracks[trackIndex];

  for (let i = 0; i < video.textTracks.length; i++) {
    video.textTracks[i].removeEventListener('cuechange', updateCustomCaptions);
  }

  textTrack.addEventListener('cuechange', updateCustomCaptions);

  toggleCaptionsVisibility(captionsEnabled);

  textTrack.mode = 'showing';
}

function updateCustomCaptions() {
  if (activeTrackIndex === -1) return;

  const textTrack = video.textTracks[activeTrackIndex];
  const captionsTextElement = customCaptionsContainer.querySelector(
    '.custom-captions-text'
  ) as HTMLDivElement;

  if (textTrack && textTrack.activeCues && textTrack.activeCues.length > 0) {
    const cue = textTrack.activeCues[0] as VTTCue;

    let cueText = '';

    if (typeof cue.text === 'string' && cue.text.trim() !== '') {
      cueText = cue.text;
    } else if (cue.getCueAsHTML) {
      const cueHTML = cue.getCueAsHTML();
      cueText = cueHTML.textContent || '';
    }

    if (cueText.trim() !== '') {
      captionsTextElement.innerHTML = cueText;
      customCaptionsContainer.classList.remove('captions-hidden');

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

    if (activeTrackIndex !== -1) {
      updateCustomCaptions();
    }
  } else {
    customCaptionsContainer.style.display = 'none';
  }
}
