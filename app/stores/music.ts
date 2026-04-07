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
    isExpanded: false, // For the sidebar queue expansion
    currentSong: null as SongMetadata | null,
    queue: [] as SongMetadata[],
    history: [] as SongMetadata[],
    currentTime: 0,
    duration: 0,
    volume: 1,
    audioElement: null as HTMLAudioElement | null,
    startTime: null as number | null,
  }),

  actions: {
    initAudio() {
      if (this.audioElement) return;
      this.audioElement = new Audio();
      this.audioElement.volume = this.volume;

      this.audioElement.addEventListener('timeupdate', () => {
        this.currentTime = this.audioElement?.currentTime || 0;
      });

      this.audioElement.addEventListener('durationchange', () => {
        this.duration = this.audioElement?.duration || 0;
      });

      this.audioElement.addEventListener('ended', () => {
        this.playNext();
      });

      this.audioElement.addEventListener('play', () => {
        this.isPlaying = true;
        this.startTime = Date.now() - (this.currentTime * 1000);
        this.updatePresence();
      });

      this.audioElement.addEventListener('pause', () => {
        this.isPlaying = false;
        this.updatePresence();
      });

      this.updateMediaSession();
    },

    playSong(song: SongMetadata, addToHistory = true) {
      this.initAudio();
      if (!this.audioElement) return;

      if (this.currentSong && addToHistory) {
        this.history.push(this.currentSong);
        if (this.history.length > 50) this.history.shift();
      }

      this.currentSong = song;
      this.startTime = Date.now() - (this.currentTime * 1000);
      this.audioElement.src = song.streamUrl;
      this.audioElement.play();
      this.updateMediaSession();
    },

    addToQueue(songs: SongMetadata | SongMetadata[]) {
      if (Array.isArray(songs)) {
        this.queue.push(...songs);
      } else {
        this.queue.push(songs);
      }
    },

    addToStartOfQueue(songs: SongMetadata | SongMetadata[]) {
      if (Array.isArray(songs)) {
        this.queue.unshift(...songs);
      } else {
        this.queue.unshift(songs);
      }
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
        this.currentSong = null;
        if (this.audioElement) {
          this.audioElement.pause();
          this.audioElement.src = '';
        }
        this.updatePresence();
      }
    },

    playPrevious() {
      if (this.currentTime > 3) {
        this.seek(0);
        return;
      }

      if (this.history.length > 0) {
        const prevSong = this.history.pop()!;
        // When playing previous, we add the current song back to the START of the queue
        if (this.currentSong) {
          this.queue.unshift(this.currentSong);
        }
        this.playSong(prevSong, false);
      } else {
        this.seek(0);
      }
    },

    shuffleQueue() {
      for (let i = this.queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.queue[i], this.queue[j]] = [this.queue[j]!, this.queue[i]!];
      }
    },

    reorderQueue(oldIndex: number, newIndex: number) {
      const movedItem = this.queue.splice(oldIndex, 1)[0];
      if (movedItem) {
        this.queue.splice(newIndex, 0, movedItem);
      }
    },

    removeFromQueue(index: number) {
      this.queue.splice(index, 1);
    },

    clearQueue() {
      this.queue = [];
    },

    setVolume(value: number) {
      this.volume = value;
      if (this.audioElement) {
        this.audioElement.volume = value;
      }
    },

    seek(time: number) {
      if (this.audioElement) {
        this.audioElement.currentTime = time;
      }
    },

    updatePresence() {
      const matrixStore = useMatrixStore();
      if (this.currentSong) {
        matrixStore.setMusicActivity({
          title: this.currentSong.title,
          artist: this.currentSong.artist,
          album: this.currentSong.album,
          coverUrl: this.currentSong.coverUrl,
          duration: Math.floor(this.duration),
          currentTime: Math.floor(this.currentTime),
          startTime: this.startTime || undefined,
          isRunning: this.isPlaying
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
    }
  }
});
