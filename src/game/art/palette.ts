// Paleta única do Pixel Party. Todo sprite e UI sai daqui para manter a coerência.
export const PAL = {
  ink: '#1b1030',      // contorno
  night: '#1a1240',    // painéis
  night2: '#2a1f5c',
  gold: '#f5b83d',
  goldHi: '#ffe08a',
  goldLo: '#a8651a',
  cream: '#f6ecd2',
  creamLo: '#d8c79a',
  grass1: '#4fae4c',
  grass2: '#459c45',
  grass3: '#3a8a3e',
  leaf1: '#2f7d3a',
  leaf2: '#1f5f31',
  leaf3: '#174a2a',
  stone1: '#9a97ad',
  stone2: '#7a7791',
  stone3: '#58566f',
  stoneHi: '#c8c6d8',
  skin: '#f2c9a0',
  skinLo: '#d9a37a',
  white: '#f4efe0',
  purple: '#6a3fb5',
  purpleHi: '#9a6fe0',
  red: '#e05252',
  blue: '#3f7fe0',
  coin: '#ffcf4a',
  coinHi: '#fff3a8',
  coinLo: '#a8651a',
  shadow: 'rgba(20,10,40,0.35)',
} as const;
export const num = (hex: string) => parseInt(hex.slice(1), 16);
