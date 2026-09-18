import './MapFilterRail.css';
import { isListedCompany } from './mapTags';

function FilterSelect({ label, value, onChange, options, disabled = false, includeAll = true }) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        {includeAll && <option value="">全部</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function MapFilterRail({
  data,
  filters,
  onSearchChange,
  activeFilterCount,
  onClearFilters,
  onModeChange,
  provinceOptions,
  cityOptions,
  districtOptions,
  isDirectMunicipality,
  onProvinceChange,
  onCityChange,
  onDistrictChange,
  onFocusDistrict,
  onBankImport,
}) {
  const listedCompanyCount = data.companies.filter(isListedCompany).length;

  return (
    <aside className="left-rail">
      <label className="search-box">
        <span>⌕</span>
        <input
          value={filters.search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="搜索企业、环节、技术"
        />
        <kbd>⌘ K</kbd>
      </label>
      <div className="filter-section filter-core">
        <div className="filter-section-title">
          <b>筛选条件</b>
          {activeFilterCount ? (
            <button className="filter-reset" onClick={onClearFilters}>
              清除筛选
            </button>
          ) : (
            <span>默认范围</span>
          )}
        </div>
        <div className="segmented">
          <button
            className={filters.mode === 'listed' ? 'active' : ''}
            onClick={() => onModeChange('listed')}
          >
            上市企业（{listedCompanyCount}）
          </button>
          <button
            className={filters.mode === 'all' ? 'active' : ''}
            onClick={() => onModeChange('all')}
          >
            全部企业（
            {data.counts.totalCompanies || data.companies.length}）
          </button>
        </div>
        <FilterSelect
          label="省"
          value={filters.province}
          onChange={onProvinceChange}
          options={provinceOptions}
        />
        {!isDirectMunicipality && (
          <FilterSelect
            label="市"
            value={filters.city}
            onChange={onCityChange}
            options={cityOptions}
            disabled={!filters.province}
          />
        )}
        <FilterSelect
          label="区"
          value={filters.district}
          onChange={(district) => {
            onDistrictChange(district);
            onFocusDistrict(district);
          }}
          options={districtOptions}
          disabled={!filters.province || (!isDirectMunicipality && !filters.city)}
        />
      </div>
      <div className="import-card">
        <div>
          <b>导入银行内部数据</b>
          <p>Excel · 客户 / 授信标识</p>
        </div>
        <label className="import-button">
          导入
          <input type="file" accept=".xlsx,.xls,.csv" onChange={onBankImport} />
        </label>
      </div>
    </aside>
  );
}
