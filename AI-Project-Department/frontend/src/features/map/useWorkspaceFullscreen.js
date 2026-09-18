import { useCallback, useEffect, useState } from 'react';

export function useWorkspaceFullscreen(clearSelection) {
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    setIsMapFullscreen((expanded) => !expanded);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (isMapFullscreen) setIsMapFullscreen(false);
      else clearSelection();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clearSelection, isMapFullscreen]);

  return { isMapFullscreen, toggleFullscreen };
}
