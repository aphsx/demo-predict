import {
  LOGIN_BRAND,
  LOGIN_RIGHT_CLIP,
} from "@/lib/login-brand-colors";

export function LoginBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <clipPath id="loginRightZone" clipPathUnits="userSpaceOnUse">
            <path d={LOGIN_RIGHT_CLIP} />
          </clipPath>

          <linearGradient id="rightFill" x1="720" y1="0" x2="720" y2="900" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={LOGIN_BRAND.darkDeep} />
            <stop offset="40%" stopColor={LOGIN_BRAND.dark} />
            <stop offset="100%" stopColor={LOGIN_BRAND.orange} />
          </linearGradient>

          <radialGradient id="darkCorner" cx="100%" cy="0%" r="52%" gradientUnits="objectBoundingBox">
            <stop offset="0%" stopColor={LOGIN_BRAND.darkDeep} />
            <stop offset="45%" stopColor={LOGIN_BRAND.dark} />
            <stop offset="100%" stopColor={LOGIN_BRAND.dark} stopOpacity="0" />
          </radialGradient>

          <radialGradient id="orangeCorner" cx="100%" cy="100%" r="50%" gradientUnits="objectBoundingBox">
            <stop offset="0%" stopColor={LOGIN_BRAND.orange} />
            <stop offset="35%" stopColor={LOGIN_BRAND.orangeDeep} />
            <stop offset="100%" stopColor={LOGIN_BRAND.orangeDeep} stopOpacity="0" />
          </radialGradient>

          <radialGradient id="blueSheen" cx="360" cy="450" r="480" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={LOGIN_BRAND.blueLight} stopOpacity="0.28" />
            <stop offset="100%" stopColor={LOGIN_BRAND.blue} stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="1440" height="900" fill={LOGIN_BRAND.blue} />
        <rect width="1440" height="900" fill="url(#blueSheen)" />

        <g clipPath="url(#loginRightZone)">
          <rect width="1440" height="900" fill="url(#rightFill)" />
          <rect width="1440" height="900" fill="url(#darkCorner)" />
          <rect width="1440" height="900" fill="url(#orangeCorner)" />
        </g>
      </svg>
    </div>
  );
}
