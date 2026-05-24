import styles from "./intro.module.css";

export function LoginBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <div className={`${styles.bgCover} ${styles.bgCoverStatic}`} />
    </div>
  );
}
