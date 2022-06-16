# gsSQL
Use SQL SELECT syntax from within apps script code or as a Google Sheet function - to replace the QUERY function.

1.  Copy the .js files into your google app script folder and CLASP PUSH if necessary.
2.  The SqlTest.js file is not required. It is just used for a basic sanity check for various SQL SELECT statements.


Using from App Script.
example:

        let stmt = "SELECT quantity, price, quantity * price from booksales where price * quantity > 100";

        let testSQL = new Sql([["booksales", "", this.bookSalesTable()],
        ["editors", "", this.editorsTable()]], stmt, true);
        
        let data = testSQL.execute();
        
1.  Create instance of Sql() object with the following constructor parameters:
2.    a)  Array of Arrays where we define each table used:
3.        i)  table name which will be referenced in SELECT statement.
4.        ii) range name  OR
5.        iii) double array of raw data to be used for this table.
6.    b)  SQL statment
7.    c)  include column title (generated by script)
8.   Execute the command and the return is a double array with the selected data.

Using from SHEETS as a custom function.
example:

        =gsSQL("[['masterTransactions', 'Master Transactions!$A$1:$I'], ['accounts', 'accountNamesData']]", "SELECT * FROM accounts WHERE registration = 'RRSP' UNION SELECT * from accounts WHERE registration = 'TFSA' ", true)
        
1.  First parameter is a double array of:  a) table name, b) Range of data.
2.  Select statement.
3.  Include column title or not.

NOTE:
1.  First ROW of data MUST be the column name.
2.  If the column includes spaces, the SELECT statement must replace the spaces with an underscore.  e.g.:  "First Name" is the column and the select would be "select first_name from myTable"
3.  Column names do not support the period ".", so you must remove periods before trying the select.
4.  Column names must be unique (obviously).
5.  When specifying the table name/data as a parameter, you should only specify tables referenced in the SELECT as all data from every table is loaded into memory for processing (I didn't say this was a memory optimized script).

WARNING:
I have used eval() and Function() to make my life easier.  If you believe that you will do some kind of injection attack on yourself at some later date, I urge you to modify the scripts to remove these from the program (or not use at all).

Most of the BASIC SELECT functionality is implemented, however if you want to do anything fancy, it is most likely not going to work.  Check out the SqlTest.js to get an idea of the kind of commands that will work.  

Known Issues:
1)  Calculated functions within calculated functions.  So something like "select Trim(Upper(first_name)) from customers"  will not work for now.
2)  Field and table alias syntax is not supported.  So in a JOIN situation, you will need to use the full DOT notation to reference any field from the joined table.  The column ALIAS can be used for a column title in the return data.
3)   e.g.:

        SELECT books.id, books.title, authors.first_name, authors.last_name 
            FROM books 
            INNER JOIN authors 
            ON books.author_id = authors.id
            ORDER BY books.id
