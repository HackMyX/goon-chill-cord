import { NextResponse } from "next/server";
import { BUILD_INFO } from "@/lib/build-info";

// Immer frisch (kein Caching) und nie statisch vorgerendert — der Endpoint muss
// die Version der GERADE laufenden (= neuesten) Deployment-Instanz liefern, damit
// ein Client mit altem Bundle erkennt, dass eine neue Version live ist.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(
    {
      versionKey: BUILD_INFO.versionKey,
      deployName: BUILD_INFO.deployName,
      commitMessage: BUILD_INFO.commitMessage,
      buildTime: BUILD_INFO.buildTime,
    },
    { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } }
  );
}
