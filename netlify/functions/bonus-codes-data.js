// 10 bonusowych kodów QR — każdy ma unikalne hasło
// Po zeskanowaniu kodu i wpisaniu hasła uczestnik dostaje +1 punkt
// ZMIEŃ hasła na własne przed drukiem!

const BONUS_CODES = [
  { id: 'B01', secret: 'ZORZA',   label: 'Bonus 1'  },
  { id: 'B02', secret: 'METEOR',  label: 'Bonus 2'  },
  { id: 'B03', secret: 'KOMETA',  label: 'Bonus 3'  },
  { id: 'B04', secret: 'GALAKTYKA', label: 'Bonus 4' },
  { id: 'B05', secret: 'SATURN',  label: 'Bonus 5'  },
  { id: 'B06', secret: 'NEPTUN',  label: 'Bonus 6'  },
  { id: 'B07', secret: 'KWAZAR',  label: 'Bonus 7'  },
  { id: 'B08', secret: 'PULSAR',  label: 'Bonus 8'  },
  { id: 'B09', secret: 'NEBULA',  label: 'Bonus 9'  },
  { id: 'B10', secret: 'SUPERNOWA', label: 'Bonus 10' },
];

module.exports = { BONUS_CODES };
