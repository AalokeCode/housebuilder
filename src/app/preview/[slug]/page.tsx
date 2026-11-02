import TourPage from "../../tour/[slug]/page";

/** Agent preview route (same as /tour). Supports ?cam=<photoId> and ?mode=dollhouse. */
export default function PreviewPage(props: { params: Promise<{ slug: string }> }) {
  return <TourPage {...props} />;
}
