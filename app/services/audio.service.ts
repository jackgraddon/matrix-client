import { useMusicStore, type SongMetadata } from '~/stores/music';
import { useActivityStore } from '~/stores/activity';

export class AudioService {
  private static instance: AudioService;
  private audio: HTMLAudioElement | null = null;

  private constructor() {
      if (import.meta.client) {
          this.audio = new Audio();
          this.setupListeners();
      }
  }

  public static getInstance(): AudioService {
    if (!AudioService.instance) AudioService.instance = new AudioService();
    return AudioService.instance;
  }

  private setupListeners() {
    if (!this.audio) return;
    const store = useMusicStore();

    this.audio.addEventListener('timeupdate', () => {
      if (Math.floor(this.audio!.currentTime) !== Math.floor(store.currentTime)) {
        store.updateTime(this.audio!.currentTime, this.audio!.duration);
        this.updateActivity();
      }
    });

    this.audio.addEventListener('play', () => {
      store.setPlaybackState(true);
      store.startTime = Date.now() - (this.audio!.currentTime * 1000);
      this.updateActivity();
    });

    this.audio.addEventListener('pause', () => {
      store.setPlaybackState(false);
      this.updateActivity();
    });

    this.audio.addEventListener('ended', () => this.playNext());
  }

  playSong(song: SongMetadata | SongMetadata[]) {
    if (!this.audio) return;
    const songs = Array.isArray(song) ? song : [song];
    if (songs.length === 0) return;

    const store = useMusicStore();
    if (store.currentSong) {
      store.history.push(store.currentSong);
      if (store.history.length > 50) store.history.shift();
    }

    const first = songs[0];
    if (!first) return;

    store.setCurrentSong(first);
    this.audio.src = first.streamUrl;
    this.audio.play();
    this.updateMediaSession(first);

    if (songs.length > 1) {
      this.addToQueue(songs.slice(1));
    }
  }

  togglePlay() {
    if (!this.audio) return;
    if (this.audio.paused) this.audio.play();
    else this.audio.pause();
  }

  addToQueue(song: SongMetadata | SongMetadata[]) {
    const store = useMusicStore();
    store.addToQueue(song);
  }

  playNext() {
    const store = useMusicStore();
    if (store.queue.length > 0) {
      this.playSong(store.queue.shift()!);
    } else {
      store.setCurrentSong(null);
      this.audio?.pause();
      this.updateActivity();
    }
  }

  setVolume(v: number) {
    if (this.audio) this.audio.volume = v;
    const store = useMusicStore();
    store.volume = v;
  }

  playPrevious() {
    const store = useMusicStore();
    if (store.history.length > 0) {
      this.playSong(store.history.pop()!);
    }
  }

  seek(time: number) {
    if (this.audio) this.audio.currentTime = time;
  }

  private updateActivity() {
    const store = useMusicStore();
    const activityStore = useActivityStore();
    if (store.currentSong) {
      activityStore.setMusicActivity({
        name: `${store.currentSong.title} by ${store.currentSong.artist}`,
        details: store.currentSong.album,
        coverUrl: store.currentSong.coverUrl,
        duration: Math.floor(store.duration),
        currentTime: Math.floor(store.currentTime),
        startTimestamp: store.startTime || Date.now(),
        is_running: true,
        is_paused: !store.isPlaying,
        type: 'music'
      });
    } else {
      activityStore.setMusicActivity(null);
    }
  }

  private updateMediaSession(song: SongMetadata) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist,
      album: song.album,
      artwork: song.coverUrl ? [{ src: song.coverUrl, sizes: '512x512', type: 'image/png' }] : []
    });
    navigator.mediaSession.setActionHandler('play', () => this.togglePlay());
    navigator.mediaSession.setActionHandler('pause', () => this.togglePlay());
    navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext());
  }
}
