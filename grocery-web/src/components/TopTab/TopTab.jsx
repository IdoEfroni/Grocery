import { NavLink } from 'react-router-dom';

export default function TopTab({ to, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      style={({ isActive }) => ({
        padding: '8px 14px',
        borderBottom: isActive ? '3px solid #646cff' : '3px solid transparent',
        textDecoration: 'none',
        color: 'inherit'
      })}
    >
      {label}
    </NavLink>
  );
}

