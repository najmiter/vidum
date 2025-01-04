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
    const textTrackUrl = await toWebVTT(file); // this function accepts a parameer of SRT subtitle blob/file object
    captionTrack.src = textTrackUrl; // Set the converted URL to track's source
    video.textTracks[0].mode = 'showing'; // Start showing subtitle to your track
  } catch (e: any) {
    console.error(e.message);
  }
});
