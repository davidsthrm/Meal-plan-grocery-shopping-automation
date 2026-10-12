-- "Handvoll" is a unit recipes really use ("2 Handvoll Rucola"). Without it such lines were
-- read as an amount without a unit and sent to review.
alter type public.unit add value 'Handvoll';
