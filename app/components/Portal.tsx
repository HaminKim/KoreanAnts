'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const Portal = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true); // 브라우저 환경에서만 작동하게 함
  }, []);

  if (!mounted) return null;

  // 모달을 document.body(HTML 최상단)로 보내버림
  return createPortal(children, document.body);
};

export default Portal;