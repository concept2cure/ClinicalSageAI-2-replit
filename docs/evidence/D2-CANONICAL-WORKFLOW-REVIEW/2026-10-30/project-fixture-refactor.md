# Project ownership fixture lint adjustment

After the original frozen red input and the first green run, `responseFor` in
`projectHomeOwnershipBoundary.test.tsx` replaced its synthetic A/B product-name
conditional with an equivalent lookup. This test-only change removes one
complexity branch (reported 16; limit 15). All cases, assertions, response values,
and real session guards remain unchanged. The original red input is retained as
recorded; root will rerun validation against the adjusted fixture.
