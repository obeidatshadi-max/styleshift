import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'StyleShift — Read the doctor. Shift your approach.',
    short_name: 'StyleShift',
    description: 'Your field coach for every doctor visit, for pharma sales reps.',
    start_url: '/play',
    display: 'standalone',
    background_color: '#f5f5fb',
    theme_color: '#5b3ff0',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  }
}
