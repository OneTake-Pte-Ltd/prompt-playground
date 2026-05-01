import htm from 'htm';
import React from 'react';

export const html = htm.bind(React.createElement);
export const {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  Fragment,
} = React;
export default React;
