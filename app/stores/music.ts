import { defineStore } from 'pinia';

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
    isExpanded: false,
    currentSong: null as SongMetadata | null,
    queue: [] as SongMetadata[],
    history: [] as SongMetadata[],
    currentTime: 0,
    duration: 0,
    volume: 1,
    startTime: null as number | null,
  }),

  actions: {
    setPlaybackState(playing: boolean) {
      this.isPlaying = playing;
    },
    setCurrentSong(song: SongMetadata | null) {
      this.currentSong = song;
    },
    updateTime(time: number, duration: number) {
      this.currentTime = time;
      this.duration = duration;
    },
    addToQueue(songs: SongMetadata | SongMetadata[]) {
      if (Array.isArray(songs)) this.queue.push(...songs);
      else this.queue.push(songs);
    },
    addToStartOfQueue(songs: SongMetadata | SongMetadata[]) {
      if (Array.isArray(songs)) this.queue.unshift(...songs);
      else this.queue.unshift(songs);
    },
    removeFromQueue(index: number) {
        this.queue.splice(index, 1);
    },
    clearQueue() {
        this.queue = [];
    },

    shuffleQueue() {
      for (let i = this.queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = this.queue[i];
        this.queue[i] = this.queue[j]!;
        this.queue[j] = temp!;
      }
    }
  }
});
