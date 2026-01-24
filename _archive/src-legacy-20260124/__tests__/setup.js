// Set up testing environment for Jest

// Mock the window.setUserRole function for testing role-based permissions
global.setUserRole = jest.fn(role => {
  console.log(`Setting role to: ${role}`);
});

// Mock global fetch API
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    blob: () => Promise.resolve(new Blob()),
  })
);

// Set up document mocks
if (typeof document !== 'undefined') {
  document.createRange = () => ({
    setStart: () => {},
    setEnd: () => {},
    commonAncestorContainer: {
      nodeName: 'BODY',
      ownerDocument: document,
    },
  });
}
