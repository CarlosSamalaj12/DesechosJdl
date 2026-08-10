// src/utils/format.js — fechas y números en español
const dateLong = new Intl.DateTimeFormat('es', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const dateShort = new Intl.DateTimeFormat('es', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export const todayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const fmtDate = (iso) => {
  if (!iso) return '';
  // iso puede venir como 'YYYY-MM-DD' o 'YYYY-MM-DD HH:MM:SS'
  const dateOnly = String(iso).slice(0, 10);
  const [y, m, d] = dateOnly.split('-').map(Number);
  return dateLong.format(new Date(y, m - 1, d));
};

export const fmtDateShort = (iso) => {
  if (!iso) return '';
  const dateOnly = String(iso).slice(0, 10);
  const [y, m, d] = dateOnly.split('-').map(Number);
  return dateShort.format(new Date(y, m - 1, d));
};

export const fmtNumber = (n, decimals = 2) => {
  if (n === null || n === undefined || isNaN(Number(n))) return '0';
  return Number(n).toLocaleString('es', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};
