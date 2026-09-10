import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'StyleShift — Read the room. Win the call.',
    short_name: 'StyleShift',
    description: 'Social Style mastery game for pharma sales reps.',
    start_url: '/play',
    display: 'standalone',
    background_color: '#05060f',
    theme_color: '#0a1230',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  }
}
