// proxy.ts - Disabled (no middleware needed)
export default function proxy() {
  return new Response(null, { status: 200 });
}

export const config = {
  matcher: [],
};
