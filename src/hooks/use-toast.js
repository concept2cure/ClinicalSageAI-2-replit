// Inspired by react-hot-toast library
import { useState, useEffect, useCallback } from 'react';

const TOAST_LIMIT = 10;
const TOAST_REMOVE_DELAY = 1000000;

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

const toasts = [];

const listeners = [];

function addToast(toast) {
  toasts.push({
    ...toast,
    id: toast.id || genId(),
    title: toast.title,
    description: toast.description,
    action: toast.action,
  });

  listeners.forEach(listener => {
    listener(toasts);
  });
}

function dismissToast(toastId) {
  let index = toasts.findIndex(toast => toast.id === toastId);
  if (index !== -1) {
    toasts.splice(index, 1);
    listeners.forEach(listener => {
      listener(toasts);
    });
  }
}

function useToast() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => {
      setMounted(false);
    };
  }, []);

  const toast = useCallback(function toast(props) {
    const id = props.id || genId();

    const update = props => addToast({ ...props, id });

    const dismiss = () => dismissToast(id);

    addToast({ ...props, id });

    return {
      id,
      dismiss,
      update,
    };
  }, []);

  return {
    toast,
    dismiss: dismissToast,
    toasts: mounted ? toasts : [],
  };
}

// Helper to allow direct import of toast without using the hook
const toast = props => {
  const id = props.id || genId();
  addToast({ ...props, id });
  return {
    id,
    dismiss: () => dismissToast(id),
    update: props => addToast({ ...props, id }),
  };
};

export { useToast, dismissToast, toast };
