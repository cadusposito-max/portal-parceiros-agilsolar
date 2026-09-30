// Tailwind pré-compilado da plataforma (index.html).
// Antes o index.html usava o cdn.tailwindcss.com, que roda um compilador de CSS
// DENTRO do navegador e reprocessa a página a cada mudança na tela — pesado em
// notebook fraco. Agora o CSS sai pronto em assets/css/tailwind.css.
//
// Regerar depois de usar classes Tailwind novas no HTML/JS:
//   npx -y tailwindcss@3.4.17 -c tailwind.config.js -i assets/css/tailwind.input.css -o assets/css/tailwind.css --minify
//
// O tema abaixo é o mesmo que ficava em `tailwind.config = {...}` no index.html.
module.exports = {
  content: ['./index.html', './assets/js/**/*.js'],
  // Classes montadas em tempo de execução (não aparecem inteiras no código).
  safelist: ['text-left', 'text-right'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'sans-serif'] },
      colors: {
        orange: { 500: '#f97316', 600: '#ea580c' },
        yellow: { 400: '#facc15', 500: '#eab308' },
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'fade-in-down': 'fadeInDown 0.5s ease-out',
        'fade-in-up': 'fadeInUp 0.5s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in-left': 'slideInLeft 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'slide-in-right': 'slideInRight 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
      },
      keyframes: {
        fadeInDown: { '0%': { opacity: '0', transform: 'translateY(-10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        fadeInUp: { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideInLeft: { '0%': { opacity: '0', transform: 'translateX(-16px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        slideInRight: { '0%': { opacity: '0', transform: 'translateX(16px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        glowPulse: { '0%, 100%': { boxShadow: '0 0 10px rgba(249,115,22,0.2)' }, '50%': { boxShadow: '0 0 25px rgba(249,115,22,0.5)' } },
        float: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
      },
    },
  },
};
