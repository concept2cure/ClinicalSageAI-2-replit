import { defineConfig } from 'prisma/config'

export default defineConfig({
  datasource: {
    provider: 'postgresql',
    url: { env: 'DATABASE_URL' }
  }
})
