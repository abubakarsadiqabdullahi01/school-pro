const LOCAL_LOGO_PATTERN =
  /^\/api\/files\/school-logos\/[a-zA-Z0-9_-]{1,100}\/[a-f0-9-]{36}\.(jpg|png|gif|webp)$/

/** Accepts locally managed logos and existing http(s) logo URLs. */
export function isLogoReference(value: string) {
  if (LOCAL_LOGO_PATTERN.test(value)) return true

  try {
    const url = new URL(value)
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password
  } catch {
    return false
  }
}
