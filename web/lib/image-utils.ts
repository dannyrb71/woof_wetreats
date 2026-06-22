// Browser-only image pipeline: HEIC → decode → resize (max 1000px) → JPEG blob
// Import dynamically so Next.js doesn't bundle heic2any for SSR.

const MAX_EDGE_PX   = 1000
const JPEG_QUALITY  = 0.85
const MAX_FILE_SIZE = 20 * 1024 * 1024  // 20 MB pre-compression

export class ImageValidationError extends Error {}

function isHeic(file: File): boolean {
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    file.name.toLowerCase().endsWith('.heic') ||
    file.name.toLowerCase().endsWith('.heif')
  )
}

async function heicToBlob(file: File): Promise<Blob> {
  // Dynamic import keeps heic2any out of the server bundle
  const heic2any = (await import('heic2any')).default
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 1 })
  return Array.isArray(result) ? result[0] : result
}

function resizeAndCompress(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      const longest = Math.max(width, height)
      if (longest > MAX_EDGE_PX) {
        const scale = MAX_EDGE_PX / longest
        width  = Math.round(width  * scale)
        height = Math.round(height * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width  = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        out => out ? resolve(out) : reject(new Error('Canvas toBlob failed')),
        'image/jpeg',
        JPEG_QUALITY
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image failed to load')) }
    img.src = url
  })
}

/**
 * Full pipeline: validate → (HEIC convert) → resize → JPEG compress.
 * Returns a JPEG Blob ready for upload.
 */
export async function processImageFile(file: File): Promise<Blob> {
  // Validation
  if (file.size > MAX_FILE_SIZE) {
    throw new ImageValidationError(`File is too large (max 20 MB). Please choose a smaller photo.`)
  }
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp']
  if (!allowed.includes(file.type) && !isHeic(file)) {
    throw new ImageValidationError(`Only JPG, PNG, and HEIC photos are accepted.`)
  }

  let blob: Blob = file
  if (isHeic(file)) {
    blob = await heicToBlob(file)
  }
  return resizeAndCompress(blob)
}
