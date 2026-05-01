/**
 * Single-URL Preact + htm bundle — no React version-mismatch risk.
 * Preact 10 is hook-compatible with React 18 (useState, useEffect, useRef, etc.)
 * and esm.sh bundles preact/hooks to import from the same preact instance.
 */
import { h, render, Component, Fragment, createContext } from 'https://esm.sh/preact@10';
import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useContext,
} from 'https://esm.sh/preact@10/hooks';
import htm from 'https://esm.sh/htm@3';

export const html = htm.bind(h);
export { render, Component, Fragment, createContext };
export { useState, useEffect, useMemo, useCallback, useRef, useContext };
