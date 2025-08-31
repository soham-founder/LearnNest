/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Enable dark mode based on 'class' attribute
  theme: {
    extend: {
      colors: {
        'primary-sky-blue': '#0080FF',
        'secondary-green': '#34A853',
        'accent-warm-orange': '#FF9500',
        // Map custom neutral colors to their CSS variables defined in index.css
        'neutral-light': 'var(--color-neutral-light)',
        'neutral-medium': 'var(--color-neutral-medium)',
        'neutral-dark': 'var(--color-neutral-dark)',
        'neutral-800': 'var(--color-neutral-800)',
        'neutral-200': 'var(--color-neutral-200)',
        // Re-add specific shades if needed for placeholder colors
        'neutral-400': '#A1A1AA',
        'neutral-500': '#71717A',
        'neutral-700': '#3F3F46',
        'neutral-900': '#18181B',
        'neutral-50': '#FAFAFA',
      },
      fontFamily: {
        poppins: ['Poppins', 'sans-serif'],
        'jetbrains-mono': ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        'xl': '12px', // Defaulting to 12px for consistency as per requirements (12px-16px)
        '2xl': '16px', // For larger elements or specific emphasis
      },
      boxShadow: {
        'soft': '0 4px 6px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.025)',
        'md': '0 4px 6px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.08)',
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'inner-soft': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.03)',
      },
      transitionProperty: {
        'height': 'height',
      },
    },
  },
  plugins: [],
}
