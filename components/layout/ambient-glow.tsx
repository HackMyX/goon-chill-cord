/**
 * The reference site's background never reads as flat black — there's
 * always a soft, layered glow sitting behind the content. This recreates
 * that "depth" with an animated CSS mesh-gradient: three large, blurred
 * color blobs that slowly drift and breathe (pure CSS keyframes, no JS),
 * fixed behind everything and never intercepting clicks.
 */
export function AmbientGlow() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="animate-mesh-a absolute -top-[10%] left-1/2 h-[60vh] w-[120vw] -translate-x-1/2"
        style={{
          background:
            "radial-gradient(closest-side, rgba(139,92,246,0.18) 0%, rgba(139,92,246,0.06) 45%, transparent 75%)",
        }}
      />
      <div
        className="animate-mesh-b absolute top-[35%] left-[10%] h-[45vh] w-[45vw]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(59,130,246,0.12) 0%, transparent 70%)",
        }}
      />
      <div
        className="animate-mesh-c absolute bottom-[-10%] right-[5%] h-[50vh] w-[50vw]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(168,85,247,0.10) 0%, transparent 70%)",
        }}
      />
      <div
        className="animate-mesh-b absolute top-[5%] right-[15%] h-[35vh] w-[35vw]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(236,72,153,0.07) 0%, transparent 70%)",
          animationDuration: "32s",
          animationDirection: "reverse",
        }}
      />
    </div>
  );
}
