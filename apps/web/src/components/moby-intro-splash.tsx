"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { INTRO_ASSETS } from "@/lib/login-brand-colors";
import styles from "./intro.module.css";

export function MobyIntroSplash() {
  const [visible, setVisible] = useState(true);
  const sectionRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const blueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const logo = logoRef.current;
    const cover = coverRef.current;
    const blue = blueRef.current;
    if (!section || !logo || !cover || !blue) return;

    gsap.set(logo, { opacity: 0, y: 0 });
    gsap.set(cover, { opacity: 0 });
    gsap.set(blue, { top: "100%" });

    const tl = gsap.timeline({
      onComplete: () => setVisible(false),
    });

    tl.to(logo, { opacity: 1, duration: 1, delay: 0 })
      .to(cover, { opacity: 1, duration: 1.5, delay: -0.8, ease: "power3.out" })
      .to(logo, { y: -120, opacity: 0, duration: 1.5, delay: -0.5, ease: "power3.out" })
      .to(blue, { top: 0, duration: 0.7, delay: -1.8, ease: "power4.in" })
      .to(section, { height: 0, delay: -1.7, duration: 0.8, ease: "power2.in" });

    return () => {
      tl.kill();
    };
  }, []);

  if (!visible) return null;

  return (
    <div ref={sectionRef} className={styles.introSection} aria-hidden="true">
      <div ref={logoRef} className={styles.logo}>
        <img src={INTRO_ASSETS.logo} alt="" className="w-full h-auto" />
      </div>
      <div ref={blueRef} className={styles.bgBlue} />
      <div ref={coverRef} className={styles.bgCover} />
    </div>
  );
}
