import { app } from './app.ts';

const PORT = parseInt(process.env.PORT || '3000', 10);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Bayan server listening on port ${PORT}`);
});
