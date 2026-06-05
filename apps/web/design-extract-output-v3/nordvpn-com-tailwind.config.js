/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
    colors: {
        primary: {
            '50': 'hsl(230, 100%, 97%)',
            '100': 'hsl(230, 100%, 94%)',
            '200': 'hsl(230, 100%, 86%)',
            '300': 'hsl(230, 100%, 76%)',
            '400': 'hsl(230, 100%, 64%)',
            '500': 'hsl(230, 100%, 50%)',
            '600': 'hsl(230, 100%, 40%)',
            '700': 'hsl(230, 100%, 32%)',
            '800': 'hsl(230, 100%, 24%)',
            '900': 'hsl(230, 100%, 16%)',
            '950': 'hsl(230, 100%, 10%)',
            DEFAULT: '#3e5fff'
        },
        secondary: {
            '50': 'hsl(5, 76%, 97%)',
            '100': 'hsl(5, 76%, 94%)',
            '200': 'hsl(5, 76%, 86%)',
            '300': 'hsl(5, 76%, 76%)',
            '400': 'hsl(5, 76%, 64%)',
            '500': 'hsl(5, 76%, 50%)',
            '600': 'hsl(5, 76%, 40%)',
            '700': 'hsl(5, 76%, 32%)',
            '800': 'hsl(5, 76%, 24%)',
            '900': 'hsl(5, 76%, 16%)',
            '950': 'hsl(5, 76%, 10%)',
            DEFAULT: '#e02f1f'
        },
        accent: {
            '50': 'hsl(221, 83%, 97%)',
            '100': 'hsl(221, 83%, 94%)',
            '200': 'hsl(221, 83%, 86%)',
            '300': 'hsl(221, 83%, 76%)',
            '400': 'hsl(221, 83%, 64%)',
            '500': 'hsl(221, 83%, 50%)',
            '600': 'hsl(221, 83%, 40%)',
            '700': 'hsl(221, 83%, 32%)',
            '800': 'hsl(221, 83%, 24%)',
            '900': 'hsl(221, 83%, 16%)',
            '950': 'hsl(221, 83%, 10%)',
            DEFAULT: '#2563eb'
        },
        'neutral-50': '#2a2a2d',
        'neutral-100': '#f7f7f8',
        'neutral-200': '#4f5054',
        'neutral-300': '#000000',
        'neutral-400': '#c8c9cb',
        'neutral-500': '#696a6d',
        'neutral-600': '#e2e2e4',
        'neutral-700': '#b2b2b3',
        'neutral-800': '#404040',
        'neutral-900': '#141415',
        background: '#ffffff',
        foreground: '#000000'
    },
    fontFamily: {
        sans: [
            'Inter',
            'sans-serif'
        ],
        heading: [
            'Noto Sans KR',
            'sans-serif'
        ]
    },
    fontSize: {
        '10': [
            '10px',
            {
                lineHeight: '15px'
            }
        ],
        '12': [
            '12px',
            {
                lineHeight: '18px'
            }
        ],
        '14': [
            '14px',
            {
                lineHeight: '21px'
            }
        ],
        '16': [
            '16px',
            {
                lineHeight: '24px'
            }
        ],
        '20': [
            '20px',
            {
                lineHeight: '30px'
            }
        ],
        '32': [
            '32px',
            {
                lineHeight: '38.4px'
            }
        ],
        '40': [
            '40px',
            {
                lineHeight: '52px',
                letterSpacing: '-0.256px'
            }
        ],
        '48': [
            '48px',
            {
                lineHeight: '62.4px',
                letterSpacing: '-0.496px'
            }
        ]
    },
    spacing: {
        '1': '2px',
        '8': '16px',
        '10': '20px',
        '12': '24px',
        '16': '32px',
        '20': '40px',
        '28': '56px',
        '32': '64px'
    },
    borderRadius: {
        md: '6px',
        lg: '12px',
        xl: '20px',
        full: '9999px'
    },
    boxShadow: {
        sm: 'rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(56, 60, 67, 0.07) 0px 0px 0px 1px, rgba(56, 60, 67, 0.15) 0px 3px 6px 0px'
    },
    screens: {
        sm: '640px',
        md: '768px',
        lg: '992px',
        '1200px': '1200px'
    },
    transitionDuration: {
        '250': '0.25s',
        '300': '0.3s',
        '400': '0.4s'
    },
    transitionTimingFunction: {
        default: 'ease',
        custom: 'cubic-bezier(0.4, 0, 0.2, 1)'
    },
    container: {
        center: true,
        padding: '0px'
    },
    maxWidth: {
        container: '1168px'
    }
},
  },
};
