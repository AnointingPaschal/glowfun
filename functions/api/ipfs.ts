// Cloudflare Pages Function: /api/ipfs
// Proxies image uploads to Pinata IPFS so the browser never needs the JWT
// POST /api/ipfs  — multipart/form-data with a "file" field
// Returns: { ipfsHash, ipfsUrl, gatewayUrl }

interface Env {
  CONFIG: KVNamespace
  IMAGES: R2Bucket
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  }

  try {
    const pinataJwt = await env.CONFIG.get('PINATA_JWT')
    if (!pinataJwt) {
      return new Response(
        JSON.stringify({ error: 'PINATA_JWT not configured. Add it in Admin → Keys & APIs.' }),
        { status: 503, headers: corsHeaders }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400, headers: corsHeaders })
    }

    // Validate file type and size (5MB max)
    if (!file.type.startsWith('image/')) {
      return new Response(JSON.stringify({ error: 'Only image files allowed' }), { status: 400, headers: corsHeaders })
    }
    if (file.size > 5 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'File too large (max 5MB)' }), { status: 400, headers: corsHeaders })
    }

    // Upload to Pinata
    const pinataForm = new FormData()
    pinataForm.append('file', file)
    pinataForm.append('pinataMetadata', JSON.stringify({ name: `glowfun-${Date.now()}` }))
    pinataForm.append('pinataOptions', JSON.stringify({ cidVersion: 1 }))

    const pinataRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${pinataJwt}` },
      body: pinataForm,
    })

    if (!pinataRes.ok) {
      const err = await pinataRes.text()
      return new Response(
        JSON.stringify({ error: `Pinata error: ${err}` }),
        { status: 502, headers: corsHeaders }
      )
    }

    const pinataData = await pinataRes.json() as { IpfsHash: string }
    const ipfsHash = pinataData.IpfsHash
    const ipfsUrl = `ipfs://${ipfsHash}`
    const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`

    // Also cache a copy in R2 for fast serving via our own domain
    try {
      const arrayBuffer = await file.arrayBuffer()
      await env.IMAGES.put(`ipfs/${ipfsHash}`, arrayBuffer, {
        httpMetadata: { contentType: file.type },
      })
    } catch {
      // R2 cache failure is non-fatal — IPFS is the source of truth
    }

    return new Response(
      JSON.stringify({ ipfsHash, ipfsUrl, gatewayUrl }),
      { status: 200, headers: corsHeaders }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: corsHeaders }
    )
  }
}

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
