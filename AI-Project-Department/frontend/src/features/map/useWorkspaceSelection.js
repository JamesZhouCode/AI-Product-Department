import { useCallback, useEffect, useState } from 'react';
import { normalize } from '../../shared/text';

export function useWorkspaceSelection() {
  const [selectedName, setSelectedName] = useState('');
  const [activeRelation, setActiveRelation] = useState(null);
  const [activeOverlap, setActiveOverlap] = useState(null);

  const clearSelection = useCallback(() => {
    setActiveRelation(null);
    setActiveOverlap(null);
    setSelectedName('');
  }, []);

  return {
    activeOverlap,
    activeRelation,
    clearSelection,
    selectedName,
    setActiveOverlap,
    setActiveRelation,
    setSelectedName,
  };
}

export function useSelectionGuards({
  activeRelation,
  clearSelection,
  regionCompanyNames,
  regionFilterActive,
  relationsForSelected,
  selectedName,
  setActiveRelation,
}) {
  useEffect(() => {
    if (selectedName && regionFilterActive && !regionCompanyNames.has(normalize(selectedName))) {
      clearSelection();
    }
    if (
      activeRelation &&
      !relationsForSelected.some((relation) => relation.id === activeRelation.id)
    )
      setActiveRelation(null);
  }, [
    activeRelation,
    clearSelection,
    regionCompanyNames,
    regionFilterActive,
    relationsForSelected,
    selectedName,
    setActiveRelation,
  ]);
}
