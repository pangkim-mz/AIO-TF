// React Theme — extracted from https://nordvpn.com/ko/link-checker/
// Compatible with: Chakra UI, Stitches, Vanilla Extract, or any CSS-in-JS

/**
 * TypeScript type definition for this theme:
 *
 * interface Theme {
 *   colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    foreground: string;
    neutral50: string;
    neutral100: string;
    neutral200: string;
    neutral300: string;
    neutral400: string;
    neutral500: string;
    neutral600: string;
    neutral700: string;
    neutral800: string;
    neutral900: string;
 *   };
 *   fonts: {
    body: string;
 *   };
 *   fontSizes: {
    '10': string;
    '12': string;
    '14': string;
    '16': string;
    '20': string;
    '32': string;
    '40': string;
    '48': string;
 *   };
 *   space: {
    '2': string;
    '16': string;
    '20': string;
    '24': string;
    '32': string;
    '40': string;
    '56': string;
    '64': string;
 *   };
 *   radii: {
    md: string;
    lg: string;
    xl: string;
    full: string;
 *   };
 *   shadows: {
    sm: string;
 *   };
 *   states: {
 *     hover: { opacity: number };
 *     focus: { opacity: number };
 *     active: { opacity: number };
 *     disabled: { opacity: number };
 *   };
 * }
 */

export const theme = {
  "colors": {
    "primary": "#3e5fff",
    "secondary": "#e02f1f",
    "accent": "#2563eb",
    "background": "#ffffff",
    "foreground": "#000000",
    "neutral50": "#2a2a2d",
    "neutral100": "#f7f7f8",
    "neutral200": "#4f5054",
    "neutral300": "#000000",
    "neutral400": "#c8c9cb",
    "neutral500": "#696a6d",
    "neutral600": "#e2e2e4",
    "neutral700": "#b2b2b3",
    "neutral800": "#404040",
    "neutral900": "#141415"
  },
  "fonts": {
    "body": "'Noto Sans KR', sans-serif"
  },
  "fontSizes": {
    "10": "10px",
    "12": "12px",
    "14": "14px",
    "16": "16px",
    "20": "20px",
    "32": "32px",
    "40": "40px",
    "48": "48px"
  },
  "space": {
    "2": "2px",
    "16": "16px",
    "20": "20px",
    "24": "24px",
    "32": "32px",
    "40": "40px",
    "56": "56px",
    "64": "64px"
  },
  "radii": {
    "md": "6px",
    "lg": "12px",
    "xl": "20px",
    "full": "9999px"
  },
  "shadows": {
    "sm": "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(56, 60, 67, 0.07) 0px 0px 0px 1px, rgba(56, 60, 67, 0.15) 0px 3px 6px 0px"
  },
  "states": {
    "hover": {
      "opacity": 0.08
    },
    "focus": {
      "opacity": 0.12
    },
    "active": {
      "opacity": 0.16
    },
    "disabled": {
      "opacity": 0.38
    }
  }
};

// MUI v5 theme
export const muiTheme = {
  "palette": {
    "primary": {
      "main": "#3e5fff",
      "light": "hsl(230, 100%, 77%)",
      "dark": "hsl(230, 100%, 47%)"
    },
    "secondary": {
      "main": "#e02f1f",
      "light": "hsl(5, 76%, 65%)",
      "dark": "hsl(5, 76%, 35%)"
    },
    "background": {
      "default": "#ffffff",
      "paper": "#f3f7fc"
    },
    "text": {
      "primary": "#000000",
      "secondary": "#2a2a2d"
    }
  },
  "typography": {
    "h1": {
      "fontSize": "32px",
      "fontWeight": "400",
      "lineHeight": "38.4px"
    },
    "h3": {
      "fontSize": "20px",
      "fontWeight": "600",
      "lineHeight": "30px"
    },
    "body1": {
      "fontSize": "16px",
      "fontWeight": "400",
      "lineHeight": "24px"
    },
    "body2": {
      "fontSize": "14px",
      "fontWeight": "400",
      "lineHeight": "21px"
    }
  },
  "shape": {
    "borderRadius": 6
  },
  "shadows": [
    "rgba(42, 43, 50, 0.07) 0px 0px 0px 1px, rgba(42, 43, 50, 0.12) 0px 15px 20px 1px",
    "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(56, 60, 67, 0.07) 0px 0px 0px 1px, rgba(56, 60, 67, 0.15) 0px 3px 6px 0px"
  ]
};

export default theme;
