// Shared types for the Universal Preview Engine config.
// NOT "use server" — imported by both client and server.

export interface PreviewConfig {
  id: string;
  // 3D character-item preview
  item3dAutoRotate: boolean;
  item3dRotationSpeed: number;    // 0.5 – 5.0
  item3dCameraFov: number;        // 20 – 80
  item3dCameraDistance: number;   // 1.5 – 6.0
  // Name Style preview
  nameStyleSize: string;          // "lg" | "xl" | "hero"
  nameStyleGlowPulse: boolean;
  // Badge preview
  badgeGlowEnabled: boolean;
  badgeGlowIntensity: number;     // 20 – 100
  // Master
  particleEffectsEnabled: boolean;
  previewBgStyle: string;         // "dark" | "space" | "glass"
  updatedAt: string | null;
}

export const DEFAULT_PREVIEW_CONFIG: PreviewConfig = {
  id: "default",
  item3dAutoRotate: true,
  item3dRotationSpeed: 1.8,
  item3dCameraFov: 42,
  item3dCameraDistance: 3.6,
  nameStyleSize: "xl",
  nameStyleGlowPulse: true,
  badgeGlowEnabled: true,
  badgeGlowIntensity: 60,
  particleEffectsEnabled: true,
  previewBgStyle: "dark",
  updatedAt: null,
};
