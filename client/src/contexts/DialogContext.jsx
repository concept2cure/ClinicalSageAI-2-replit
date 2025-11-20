import React, { createContext, useContext, useState } from 'react';

// Create a context for dialog state management
const DialogContext = createContext({
  isOpen: false,
  dialogType: null,
  dialogData: null,
  openDialog: () => {},
  closeDialog: () => {},
});

// Custom hook to use dialog context
export const useDialogContext = () => useContext(DialogContext);

// Provider component
export const DialogContextProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dialogType, setDialogType] = useState(null);
  const [dialogData, setDialogData] = useState(null);

  const openDialog = (type, data = null) => {
    setDialogType(type);
    setDialogData(data);
    setIsOpen(true);
  };

  const closeDialog = () => {
    setIsOpen(false);
    // Delay clearing the dialog type and data to allow for exit animations
    setTimeout(() => {
      setDialogType(null);
      setDialogData(null);
    }, 300);
  };

  return (
    <DialogContext.Provider
      value={{
        isOpen,
        dialogType,
        dialogData,
        openDialog,
        closeDialog,
      }}
    >
      {children}
    </DialogContext.Provider>
  );
};

export default DialogContext;
