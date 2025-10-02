import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { imageUrl } = await request.json()
    
    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      )
    }

    console.log('Converting image:', imageUrl)
    
    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`)
    }
    
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const base64 = buffer.toString('base64')
    
    // Get content type from response headers or default to jpeg
    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const dataURL = `data:${contentType};base64,${base64}`
    
    console.log('Image converted successfully')
    
    return NextResponse.json({ 
      success: true,
      dataURL 
    })
  } catch (error) {
    console.error('Error converting image:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to convert image',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}