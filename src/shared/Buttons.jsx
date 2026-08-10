// src/shared/Buttons.jsx — botones consistentes
import './Buttons.css';

export function BtnPrimary({ children, ...rest }) {
  return <button className="btn btn-primary" {...rest}>{children}</button>;
}
export function BtnSecondary({ children, ...rest }) {
  return <button className="btn btn-secondary" {...rest}>{children}</button>;
}
export function BtnDanger({ children, ...rest }) {
  return <button className="btn btn-danger" {...rest}>{children}</button>;
}
export function BtnGhost({ children, ...rest }) {
  return <button className="btn btn-ghost" {...rest}>{children}</button>;
}
