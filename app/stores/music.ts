import { defineStore } from 'pinia';
import { useMatrixStore } from '~/stores/matrix';

export interface SongMetadata {
  id: string;
  title: string;
  artist: string;
  album?: string;
  albumArtist?: string;
  duration?: number;
  coverUrl?: string;
  streamUrl: string;
}

export const useMusicStore = defineStore('music', {
  state: () => ({
    isPlaying: false,
    currentSong: null as SongMetadata | null,
    queue: [] as SongMetadata[],
    currentTime: 0,
    volume: 1,
    audioElement: null as HTMLAudioElement | null,
  }),

  actions: {
    initAudio() {
      if (this.audioElement) return;
      this.audioElement = new Audio();
      this.audioElement.volume = this.volume;

      this.audioElement.addEventListener('timeupdate', () => {
        this.currentTime = this.audioElement?.currentTime || 0;
      });

      this.audioElement.addEventListener('ended', () => {
        this.playNext();
      });

      this.audioElement.addEventListener('play', () => {
        this.isPlaying = true;
        this.updatePresence();
      });

      this.audioElement.addEventListener('pause', () => {
        this.isPlaying = false;
        this.updatePresence();
      });
    },

    playSong(song: SongMetadata) {
      this.initAudio();
      if (!this.audioElement) return;

      this.currentSong = song;
      this.audioElement.src = song.streamUrl;
      this.audioElement.play();
      this.updateMediaSession();
    },

    togglePlay() {
      if (!this.audioElement) return;
      if (this.isPlaying) {
        this.audioElement.pause();
      } else {
        this.audioElement.play();
      }
    },

    playNext() {
      if (this.queue.length > 0) {
        const nextSong = this.queue.shift()!;
        this.playSong(nextSong);
      } else {
        this.isPlaying = false;
        if (this.audioElement) this.audioElement.pause();
      }
    },

    setVolume(value: number) {
      this.volume = value;
      if (this.audioElement) {
        this.audioElement.volume = value;
      }
    },

    updatePresence() {
      const matrixStore = useMatrixStore();
      if (this.isPlaying && this.currentSong) {
        // Set Matrix Rich Activity
        matrixStore.setMusicActivity({
          title: this.currentSong.title,
          artist: this.currentSong.artist,
          album: this.currentSong.album,
          isRunning: true
        });
      } else {
        matrixStore.setMusicActivity(null);
      }
    },

    updateMediaSession() {
      if (!this.currentSong || !('mediaSession' in navigator)) return;

      navigator.mediaSession.metadata = new MediaMetadata({
        title: this.currentSong.title,
        artist: this.currentSong.artist,
        album: this.currentSong.album,
        artwork: this.currentSong.coverUrl ? [
          { src: this.currentSong.coverUrl, sizes: '96x96', type: 'image/png' },
          { src: this.currentSong.coverUrl, sizes: '128x128', type: 'image/png' },
          { src: this.currentSong.coverUrl, sizes: '192x192', type: 'image/png' },
          { src: this.currentSong.coverUrl, sizes: '256x256', type: 'image/png' },
          { src: this.currentSong.coverUrl, sizes: '384x384', type: 'image/png' },
          { src: this.currentSong.coverUrl, sizes: '512x512', type: 'image/png' },
        ] : []
      });

      navigator.mediaSession.setActionHandler('play', () => this.togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => this.togglePlay());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext());
      // prevtrack could be added if we had a history
    }
  }
});
