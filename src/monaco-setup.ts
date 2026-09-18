/**
 * Configure @monaco-editor/react loader.
 * Default CDN: cdn.jsdelivr.net — this is fine for most deployments.
 * If you need to use a different CDN, change the paths.vs URL below.
 */
import { loader } from '@monaco-editor/react'

// Loader default (can override CDN here if needed):
// loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.0/min/vs' } })

// Using the built-in default is fine — jsDelivr is globally available.
// No customization needed unless you have a specific CDN policy.
export {}
