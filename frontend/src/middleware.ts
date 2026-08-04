import { NextResponse, type NextRequest } from 'next/server';
import { verifyRenderTokenSignature } from '@/lib/renderToken';

// Gates /print/[summaryId] before the page ever renders — an expired or
// forged render token gets a real 403 here, never a rendered page
// (docs/studysheet-milestones.md M6: "An expired or forged render token
// returns 403 and produces no PDF"). Only checks the signature/expiry/
// summaryId match (stateless, no DB) — single-use is enforced separately by
// the backend's GET /api/render/:summaryId, which the page component calls
// next for the actual summary data.
export async function middleware(request: NextRequest) {
  const secret = process.env.RENDER_TOKEN_SECRET;
  const summaryId = request.nextUrl.pathname.split('/')[2];
  const token = request.nextUrl.searchParams.get('token');

  if (!secret || !summaryId || !token) {
    return new NextResponse(null, { status: 403 });
  }

  const valid = await verifyRenderTokenSignature(token, summaryId, secret);
  if (!valid) {
    return new NextResponse(null, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/print/:path*',
};
