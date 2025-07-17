-- CreateTable
CREATE TABLE "_TodoDependencies" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_TodoDependencies_A_fkey" FOREIGN KEY ("A") REFERENCES "Todo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_TodoDependencies_B_fkey" FOREIGN KEY ("B") REFERENCES "Todo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "_TodoDependencies_AB_unique" ON "_TodoDependencies"("A", "B");

-- CreateIndex
CREATE INDEX "_TodoDependencies_B_index" ON "_TodoDependencies"("B");
