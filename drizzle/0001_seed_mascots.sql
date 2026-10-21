-- Catálogo oficial e fechado de mascotes (exatamente seis). Ids estáveis.
INSERT INTO "mascots" ("id", "name", "title", "catchphrase", "sort_order") VALUES
  ('lince', 'Lince', 'O Estrategista', 'Vamos tomar decisões melhores hoje para conquistar mais liberdade amanhã.', 1),
  ('capivara', 'Capivara', 'A Companheira', 'Um passo de cada vez. Consistência também é uma forma de riqueza.', 2),
  ('coruja', 'Coruja', 'A Conselheira', 'Entender seu dinheiro é o primeiro passo para decidir melhor.', 3),
  ('polvo', 'Polvo', 'O Organizador', 'Vamos colocar tudo em ordem para você ter controle de verdade.', 4),
  ('raposa', 'Raposa', 'A Estrategista', 'Com a estratégia certa, seus objetivos ficam mais próximos.', 5),
  ('guardiao', 'Guardião', 'O Consultor Digital', 'Estou acompanhando seu plano. Vamos agir antes que os problemas apareçam.', 6)
ON CONFLICT ("id") DO NOTHING;
