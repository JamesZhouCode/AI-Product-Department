import './IndustrySwitcher.css';

export default function IndustrySwitcher({ value, options = [], onChange }) {
  return (
    <label className="industry-switcher">
      <span>当前产业链</span>
      <select
        aria-label="当前产业链"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
      >
        {options.map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
