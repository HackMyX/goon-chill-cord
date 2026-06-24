"use client";

import { useState, useEffect, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateGender } from "@/lib/actions/wardrobe";
import { CharacterModel } from "@/components/world/character-model";

function GenderPreview({ gender }: { gender: "m" | "w" }) {
  return (
    <div className="h-52 w-full overflow-hidden rounded-xl bg-[#08050f]">
      <Canvas shadows={{ type: THREE.PCFShadowMap }} camera={{ position: [0, 1.5, 3.6], fov: 44 }}>
        <Suspense fallback={null}>
          <color attach="background" args={["#08050f"]} />
          <ambientLight intensity={0.55} color="#a78bfa" />
          <directionalLight position={[3, 5, 3]} intensity={1.1} castShadow />
          <pointLight position={[-3, 2, -2]} intensity={9} color="#8b5cf6" />
          <group position={[0, -1.3, 0]}>
            <CharacterModel equippedByCategory={{}} gender={gender} />
          </group>
          <ContactShadows position={[0, -1.3, 0]} opacity={0.5} scale={3.5} blur={2} far={3} />
          <OrbitControls
            target={[0, 0.1, 0]}
            enablePan={false}
            minDistance={2.5}
            maxDistance={4}
            minPolarAngle={Math.PI / 4}
            maxPolarAngle={Math.PI / 1.9}
            autoRotate
            autoRotateSpeed={1.4}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

export function GenderGate() {
  const [show, setShow] = useState(false);
  const [selected, setSelected] = useState<"m" | "w">("m");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      sb.from("profiles")
        .select("gender_locked, role")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (!data) return;
          if (data.role !== "admin" && !data.gender_locked) {
            setShow(true);
          }
        });
    });
  }, []);

  async function handleConfirm() {
    setSaving(true);
    const result = await updateGender(selected);
    if (result.success) setShow(false);
    setSaving(false);
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="gender-gate-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 backdrop-blur-md"
        >
          <motion.div
            key="gender-gate-card"
            initial={{ scale: 0.88, y: 32, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 16, opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="relative mx-4 w-full max-w-xs overflow-hidden rounded-2xl border border-white/10"
            style={{
              background: "linear-gradient(160deg, #0f0e1e 0%, #09080f 100%)",
              boxShadow: "0 0 100px -16px rgba(124,58,237,0.5), 0 0 0 1px rgba(139,92,246,0.15)",
            }}
          >
            {/* top accent */}
            <div
              className="h-[2px] w-full"
              style={{
                background: "linear-gradient(90deg, #7c3aed, #a855f7, #d946ef, #a855f7, #7c3aed)",
              }}
            />

            {/* ambient glow blob */}
            <div
              className="pointer-events-none absolute -left-12 -top-12 h-48 w-48 rounded-full blur-3xl"
              style={{ background: "rgba(139,92,246,0.18)" }}
            />

            <div className="relative p-5">
              {/* Header */}
              <div className="mb-4 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/20 text-xl">
                  🎮
                </div>
                <h2 className="text-base font-bold text-white">Charakter wählen</h2>
                <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                  Einmalige Auswahl — danach dauerhaft gespeichert.
                </p>
              </div>

              {/* 3D Preview */}
              <GenderPreview gender={selected} />

              {/* M/W Toggle */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSelected("m")}
                  className={`relative flex flex-col items-center gap-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition-all duration-200 ${
                    selected === "m"
                      ? "border-purple-400/60 bg-purple-500/15 text-purple-300 shadow-[0_0_16px_-4px_rgba(168,85,247,0.5)]"
                      : "border-white/10 bg-white/[0.03] text-zinc-500 hover:border-white/20 hover:text-zinc-300"
                  }`}
                >
                  <span className="text-lg leading-none">♂</span>
                  <span className="text-[11px]">Männlich</span>
                  {selected === "m" && (
                    <span className="absolute right-2 top-2 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-purple-500">
                      <Check className="h-2 w-2 text-white" />
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setSelected("w")}
                  className={`relative flex flex-col items-center gap-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition-all duration-200 ${
                    selected === "w"
                      ? "border-fuchsia-400/60 bg-fuchsia-500/15 text-fuchsia-300 shadow-[0_0_16px_-4px_rgba(217,70,239,0.5)]"
                      : "border-white/10 bg-white/[0.03] text-zinc-500 hover:border-white/20 hover:text-zinc-300"
                  }`}
                >
                  <span className="text-lg leading-none">♀</span>
                  <span className="text-[11px]">Weiblich</span>
                  {selected === "w" && (
                    <span className="absolute right-2 top-2 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-fuchsia-500">
                      <Check className="h-2 w-2 text-white" />
                    </span>
                  )}
                </button>
              </div>

              {/* Confirm */}
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="mt-3 w-full rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:from-purple-500 hover:to-violet-500 hover:shadow-purple-500/30 disabled:opacity-50"
              >
                {saving ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Wird gespeichert…
                  </span>
                ) : (
                  "Charakter bestätigen"
                )}
              </button>

              <p className="mt-2 text-center text-[10px] text-zinc-700">
                Admins können ihren Charakter jederzeit in der Garderobe ändern.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
