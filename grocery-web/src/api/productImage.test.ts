import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildImageSearchUrl, findProductImageByBarcode } from './productImage'

function offHit(name: string, imageUrl: string) {
  return new Response(JSON.stringify({ status: 1, product: { product_name: name, image_front_url: imageUrl } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const offMiss = () =>
  new Response(JSON.stringify({ status: 0 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const imageResponse = () =>
  new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
  })

describe('findProductImageByBarcode', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('returns the product photo when the barcode is known', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(offHit('נועם 15%', 'https://images.example/front.jpg'))
      .mockResolvedValueOnce(imageResponse())

    const found = await findProductImageByBarcode('7290102396665')
    expect(found).not.toBeNull()
    expect(found!.productName).toBe('נועם 15%')
    expect(found!.file.type).toBe('image/jpeg')
    expect(found!.file.name).toContain('7290102396665')
  })

  it('falls through to the beauty database when food has no match', async () => {
    // A grocery shop stocks toiletries too, and those live in a sibling
    // database rather than Open Food Facts proper.
    vi.mocked(fetch)
      .mockResolvedValueOnce(offMiss())
      .mockResolvedValueOnce(offHit('Deodorant', 'https://images.example/d.jpg'))
      .mockResolvedValueOnce(imageResponse())

    const found = await findProductImageByBarcode('8717163655764')
    expect(found).not.toBeNull()
    expect(found!.productName).toBe('Deodorant')
  })

  it('resolves to null when nothing has the barcode', async () => {
    // The common case for Israeli barcodes. It must be a plain null, not a
    // throw, so the UI can present it as "not found" rather than an error.
    vi.mocked(fetch).mockResolvedValue(offMiss())
    await expect(findProductImageByBarcode('0000000000000')).resolves.toBeNull()
  })

  it('survives one database being down', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(offHit('Found anyway', 'https://images.example/x.jpg'))
      .mockResolvedValueOnce(imageResponse())

    const found = await findProductImageByBarcode('123')
    expect(found?.productName).toBe('Found anyway')
  })

  it('rejects a non-image response rather than staging junk', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(offHit('x', 'https://images.example/notreally'))
      .mockResolvedValueOnce(
        new Response('<html>404</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      )
      .mockResolvedValue(offMiss())

    await expect(findProductImageByBarcode('123')).resolves.toBeNull()
  })

  it('ignores an empty barcode without calling out', async () => {
    await expect(findProductImageByBarcode('   ')).resolves.toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('buildImageSearchUrl', () => {
  it('combines name and barcode', () => {
    // The name is what brings back packaging shots; a bare barcode tends to
    // surface price-comparison pages instead.
    const url = buildImageSearchUrl('7290102396665', 'נועם 15%')
    expect(url).toContain('tbm=isch')
    expect(decodeURIComponent(url)).toContain('נועם 15%')
    expect(decodeURIComponent(url)).toContain('7290102396665')
  })

  it('works with the barcode alone', () => {
    expect(decodeURIComponent(buildImageSearchUrl('7290102396665'))).toContain('7290102396665')
  })
})
