//  Remove comments for testing in NODE
/*  *** DEBUG START ***
export { sql2ast, sqlCondition2JsCondition };
//  *** DEBUG END  ***/

//  Code inspired from:  https://github.com/dsferruzza/simpleSqlParser

function trim(str) {
    if (typeof str === 'string')
        return str.trim();
    return str;
}

// Split a string using a separator, only if this separator isn't beetween brackets
/**
 * 
 * @param {String} separator 
 * @param {String} str 
 * @returns {String[]}
 */
function protect_split(separator, str) {
    const sep = '######';

    let inQuotedString = false;
    let quoteChar = "";
    let bracketCount = 0;
    let newStr = "";
    for (const c of str) {
        if (!inQuotedString && /['"`]/.test(c)) {
            inQuotedString = true;
            quoteChar = c;
        }
        else if (inQuotedString && c === quoteChar) {
            inQuotedString = false;
        }
        else if (!inQuotedString && c === '(') {
            bracketCount++;
        }
        else if (!inQuotedString && c === ')') {
            bracketCount--;
        }

        if (c === separator && (bracketCount > 0 || inQuotedString)) {
            newStr += sep;
        }
        else {
            newStr += c;
        }
    }

    let strParts = newStr.split(separator);
    strParts = strParts.map(function (item) {
        return trim(item.replace(new RegExp(sep, 'g'), separator));
    });

    return strParts;
}

// Add some # inside a string to avoid it to match a regex/split
function protect(str) {
    let result = '#';
    const length = str.length;
    for (let i = 0; i < length; i++) {
        result += str[i] + "#";
    }
    return result;
}

// Restore a string output by protect() to its original state
function unprotect(str) {
    let result = '';
    const length = str.length;
    for (let i = 1; i < length; i = i + 2) result += str[i];
    return result;
}

/**
 * 
 * @param {String} str 
 * @param {String[]} parts_name_escaped
 * @param {Object} replaceFunction
 */
function hideInnerSql(str, parts_name_escaped, replaceFunction) {
    if (str.indexOf("(") === -1 && str.indexOf(")") === -1)
        return str;

    let bracketCount = 0;
    let endCount = -1;
    let newStr = str;

    for (let i = newStr.length - 1; i >= 0; i--) {
        const ch = newStr.charAt(i);

        if (ch === ")") {
            bracketCount++;

            if (bracketCount === 1) {
                endCount = i;
            }
        }
        else if (ch === "(") {
            bracketCount--;
            if (bracketCount === 0) {

                let query = newStr.substring(i, endCount + 1);

                // Hide words defined as separator but written inside brackets in the query
                query = query.replace(new RegExp(parts_name_escaped.join('|'), 'gi'), replaceFunction);

                newStr = newStr.substring(0, i) + query + newStr.substring(endCount + 1);
            }
        }
    }
    return newStr;
}

/**
 * 
 * @param {String} src 
 * @returns {String}
 */
function sqlStatementSplitter(src) {
    let newStr = src;

    // Define which words can act as separator
    const reg = makeSqlPartsSplitterRegEx(["UNION ALL", "UNION", "INTERSECT", "EXCEPT"]);

    const matchedUnions = newStr.match(reg);
    if (matchedUnions === null || matchedUnions.length === 0)
        return newStr;

    let prefix = "";
    const parts = [];
    let pos = newStr.search(matchedUnions[0]);
    if (pos > 0) {
        prefix = newStr.substring(0, pos);
        newStr = newStr.substring(pos + matchedUnions[0].length);
    }

    for (let i = 1; i < matchedUnions.length; i++) {
        const match = matchedUnions[i];
        pos = newStr.search(match);

        parts.push(newStr.substring(0, pos));
        newStr = newStr.substring(pos + match.length);
    }
    if (newStr.length > 0)
        parts.push(newStr);

    newStr = prefix;
    for (let i = 0; i < matchedUnions.length; i++) {
        newStr += matchedUnions[i] + " (" + parts[i] + ") ";
    }

    return newStr;
}

/**
 * 
 * @param {String[]} keywords 
 * @returns {RegExp}
 */
function makeSqlPartsSplitterRegEx(keywords) {
    // Define which words can act as separator
    let parts_name = keywords.map(function (item) {
        return item + ' ';
    });
    parts_name = parts_name.concat(keywords.map(function (item) {
        return item + '(';
    }));
    parts_name = parts_name.concat(parts_name.map(function (item) {
        return item.toLowerCase();
    }));
    const parts_name_escaped = parts_name.map(function (item) {
        return item.replace('(', '[\\(]');
    });

    return new RegExp(parts_name_escaped.join('|'), 'gi');
}


/**
 * Parse a query
 * @param {String} query 
 * @returns {Object}
 */
function sql2ast(query) {
    // Define which words can act as separator
    const keywords = ['SELECT', 'FROM', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL JOIN', 'ORDER BY', 'GROUP BY', 'HAVING', 'WHERE', 'LIMIT', 'UNION ALL', 'UNION', 'INTERSECT', 'EXCEPT', 'PIVOT'];

    let parts_name = keywords.map(function (item) {
        return item + ' ';
    });
    parts_name = parts_name.concat(keywords.map(function (item) {
        return item + '(';
    }));
    parts_name = parts_name.concat(parts_name.map(function (item) {
        return item.toLowerCase();
    }));
    const parts_name_escaped = parts_name.map(function (item) {
        return item.replace('(', '[\\(]');
    });

    let modifiedQuery = sqlStatementSplitter(query);

    // Hide words defined as separator but written inside brackets in the query
    modifiedQuery = hideInnerSql(modifiedQuery, parts_name_escaped, protect);

    // Write the position(s) in query of these separators
    const parts_order = [];
    function realNameCallback(_match, name) {
        return name;
    }
    parts_name.forEach(function (item) {
        let pos = 0;
        let part = 0;

        do {
            part = modifiedQuery.indexOf(item, pos);
            if (part !== -1) {
                const realName = item.replace(/^((\w|\s)+?)\s?\(?$/i, realNameCallback);

                if (typeof parts_order[part] === 'undefined' || parts_order[part].length < realName.length) {
                    parts_order[part] = realName;	// Position won't be exact because the use of protect()  (above) and unprotect() alter the query string ; but we just need the order :)
                }

                pos = part + realName.length;
            }
        }
        while (part !== -1);
    });

    // Delete duplicates (caused, for example, by JOIN and INNER JOIN)
    let busy_until = 0;
    parts_order.forEach(function (item, key) {
        if (busy_until > key) delete parts_order[key];
        else {
            busy_until = parseInt(key, 10) + item.length;

            // Replace JOIN by INNER JOIN
            if (item === 'JOIN') parts_order[key] = 'INNER JOIN';
        }
    });

    // Generate protected word list to reverse the use of protect()
    let words = parts_name_escaped.slice(0);
    words = words.map(function (item) {
        return protect(item);
    });

    // Split parts
    const parts = modifiedQuery.split(new RegExp(parts_name_escaped.join('|'), 'i'));

    // Unhide words precedently hidden with protect()
    modifiedQuery = hideInnerSql(modifiedQuery, words, unprotect);

    for (let i = 0; i < parts.length; i++) {
        parts[i] = hideInnerSql(parts[i], words, unprotect);
    }

    // Define analysis functions
    const analysis = {};

    analysis['SELECT'] = function (str) {
        let selectResult = protect_split(',', str);
        selectResult = selectResult.filter(function (item) {
            return item !== '';
        }).map(function (item) {
            //  Is there a column alias?
            const [field, alias] = getNameAndAlias(item);

            const splitPattern = /[\s()*/%+-]+/g;
            let terms = field.split(splitPattern);

            if (terms !== null) {
                const aggFunc = ["SUM", "MIN", "MAX", "COUNT", "AVG", "DISTINCT"];
                terms = (aggFunc.indexOf(terms[0].toUpperCase()) === -1) ? terms : null;
            }
            if (field !== "*" && terms !== null && terms.length > 1) {
                return {
                    name: field,
                    terms: terms,
                    as: alias
                };
            }
            return { name: field, as: alias };
        });
        return selectResult;
    };

    analysis['FROM'] = function (str) {
        let fromResult = str.split(',');
        fromResult = fromResult.map(function (item) {
            return trim(item);
        });
        fromResult = fromResult.map(function (item) {
            const [table, alias] = getNameAndAlias(item);
            return { table: table, as: alias };
        });
        return fromResult;
    };

    analysis['LEFT JOIN'] = analysis['JOIN'] = analysis['INNER JOIN'] = analysis['RIGHT JOIN'] = analysis['FULL JOIN'] = function (str) {
        const strParts = str.toUpperCase().split(' ON ');
        const table = strParts[0].split(' AS ');
        const joinResult = {};
        joinResult['table'] = trim(table[0]);
        joinResult['as'] = trim(table[1]) || '';
        joinResult['cond'] = trim(strParts[1]);

        return joinResult;
    };

    analysis['WHERE'] = function (str) {
        return trim(str);
    };

    analysis['ORDER BY'] = function (str) {
        const strParts = str.split(',');
        const orderByResult = [];
        strParts.forEach(function (item, _key) {
            const order_by = /([\w\.]+)\s*(ASC|DESC)?/gi;
            const orderData = order_by.exec(item);
            if (orderData !== null) {
                const tmp = {};
                tmp['column'] = trim(orderData[1]);
                tmp['order'] = trim(orderData[2]);
                if (typeof orderData[2] === 'undefined') {
                    const orderParts = item.trim().split(" ");
                    if (orderParts.length > 1)
                        throw new Error(`Invalid ORDER BY:  ${item}`);
                    tmp['order'] = "ASC";
                }
                orderByResult.push(tmp);
            }
        });
        return orderByResult;
    };

    analysis['GROUP BY'] = function (str) {
        const strParts = str.split(',');
        const groupByResult = [];
        strParts.forEach(function (item, _key) {
            const group_by = /([\w\.]+)/gi;
            const groupData = group_by.exec(item);
            if (groupData !== null) {
                const tmp = {};
                tmp['column'] = trim(groupData[1]);
                groupByResult.push(tmp);
            }
        });
        return groupByResult;
    };

    analysis['PIVOT'] = function (str) {
        const strParts = str.split(',');
        const pivotResult = [];
        strParts.forEach(function (item, _key) {
            const pivotOn = /([\w\.]+)/gi;
            const pivotData = pivotOn.exec(item);
            if (pivotData !== null) {
                const tmp = {};
                tmp['name'] = trim(pivotData[1]);
                tmp['as'] = "";
                pivotResult.push(tmp);
            }
        });
        return pivotResult;
    };

    analysis['LIMIT'] = function (str) {
        const limitResult = {};
        limitResult['nb'] = parseInt(str, 10);
        limitResult['from'] = 0;
        return limitResult;
    };

    analysis['HAVING'] = function (str) {
        return trim(str);
    };

    analysis['UNION'] = function (str) {
        return trim(str);
    };

    analysis['UNION ALL'] = function (str) {
        return trim(str);
    };

    analysis['INTERSECT'] = function (str) {
        return trim(str);
    };

    analysis['EXCEPT'] = function (str) {
        return trim(str);
    };

    // Analyze parts
    const result = {};
    let j = 0;
    parts_order.forEach(function (item, _key) {
        const itemName = item.toUpperCase();
        j++;
        if (typeof analysis[itemName] !== 'undefined') {
            const part_result = analysis[itemName](parts[j]);

            if (typeof result[itemName] !== 'undefined') {
                if (typeof result[itemName] === 'string' || typeof result[itemName][0] === 'undefined') {
                    const tmp = result[itemName];
                    result[itemName] = [];
                    result[itemName].push(tmp);
                }

                result[itemName].push(part_result);
            }
            else result[itemName] = part_result;
        }
        else {
            throw new Error(`Can't analyze statement ${itemName}`);
        }
    });

    // Reorganize joins
    if (typeof result['LEFT JOIN'] !== 'undefined') {
        if (typeof result['JOIN'] === 'undefined') result['JOIN'] = [];
        if (typeof result['LEFT JOIN'][0] !== 'undefined') {
            result['LEFT JOIN'].forEach(function (item) {
                item.type = 'left';
                result['JOIN'].push(item);
            });
        }
        else {
            result['LEFT JOIN'].type = 'left';
            result['JOIN'].push(result['LEFT JOIN']);
        }
        delete result['LEFT JOIN'];
    }
    if (typeof result['INNER JOIN'] !== 'undefined') {
        if (typeof result['JOIN'] === 'undefined') result['JOIN'] = [];
        if (typeof result['INNER JOIN'][0] !== 'undefined') {
            result['INNER JOIN'].forEach(function (item) {
                item.type = 'inner';
                result['JOIN'].push(item);
            });
        }
        else {
            result['INNER JOIN'].type = 'inner';
            result['JOIN'].push(result['INNER JOIN']);
        }
        delete result['INNER JOIN'];
    }
    if (typeof result['RIGHT JOIN'] !== 'undefined') {
        if (typeof result['JOIN'] === 'undefined') result['JOIN'] = [];
        if (typeof result['RIGHT JOIN'][0] !== 'undefined') {
            result['RIGHT JOIN'].forEach(function (item) {
                item.type = 'right';
                result['JOIN'].push(item);
            });
        }
        else {
            result['RIGHT JOIN'].type = 'right';
            result['JOIN'].push(result['RIGHT JOIN']);
        }
        delete result['RIGHT JOIN'];
    }
    if (typeof result['FULL JOIN'] !== 'undefined') {
        if (typeof result['JOIN'] === 'undefined') result['JOIN'] = [];
        if (typeof result['FULL JOIN'][0] !== 'undefined') {
            result['FULL JOIN'].forEach(function (item) {
                item.type = 'full';
                result['JOIN'].push(item);
            });
        }
        else {
            result['FULL JOIN'].type = 'full';
            result['JOIN'].push(result['FULL JOIN']);
        }
        delete result['FULL JOIN'];
    }


    // Parse conditions
    if (typeof result['WHERE'] === 'string') {
        result['WHERE'] = CondParser.parse(result['WHERE']);
    }
    if (typeof result['HAVING'] === 'string') {
        result['HAVING'] = CondParser.parse(result['HAVING']);
    }
    if (typeof result['JOIN'] !== 'undefined') {
        result['JOIN'].forEach(function (item, key) {
            result['JOIN'][key]['cond'] = CondParser.parse(item['cond']);
        });
    }

    if (typeof result['UNION'] === 'string') {
        result['UNION'] = [sql2ast(parseUnion(result['UNION']))];
    }
    else if (typeof result['UNION'] !== 'undefined') {
        for (let i = 0; i < result['UNION'].length; i++) {
            result['UNION'][i] = sql2ast(parseUnion(result['UNION'][i]));
        }
    }

    if (typeof result['UNION ALL'] === 'string') {
        result['UNION ALL'] = [sql2ast(parseUnion(result['UNION ALL']))];
    }
    else if (typeof result['UNION ALL'] !== 'undefined') {
        for (let i = 0; i < result['UNION ALL'].length; i++) {
            result['UNION ALL'][i] = sql2ast(parseUnion(result['UNION ALL'][i]));
        }
    }

    if (typeof result['INTERSECT'] === 'string') {
        result['INTERSECT'] = [sql2ast(parseUnion(result['INTERSECT']))];
    }
    else if (typeof result['INTERSECT'] !== 'undefined') {
        for (let i = 0; i < result['INTERSECT'].length; i++) {
            result['INTERSECT'][i] = sql2ast(parseUnion(result['INTERSECT'][i]));
        }
    }

    if (typeof result['EXCEPT'] === 'string') {
        result['EXCEPT'] = [sql2ast(parseUnion(result['EXCEPT']))];
    }
    else if (typeof result['EXCEPT'] !== 'undefined') {
        for (let i = 0; i < result['EXCEPT'].length; i++) {
            result['EXCEPT'][i] = sql2ast(parseUnion(result['EXCEPT'][i]));
        }
    }


    return result;
}

function parseUnion(inStr) {
    let unionString = inStr;
    if (unionString.startsWith("(") && unionString.endsWith(")")) {
        unionString = unionString.substring(1, unionString.length - 1);
    }

    return unionString;
}

/**
 * If an ALIAS is specified after 'AS', return the field/table name and the alias.
 * @param {String} item 
 * @returns {[String, String]}
 */
function getNameAndAlias(item) {
    let realName = item;
    let alias = "";
    const lastAs = lastIndexOfOutsideLiteral(item.toUpperCase(), " AS ");
    if (lastAs !== -1) {
        const subStr = item.substring(lastAs + 4).trim();
        if (subStr.length > 0) {
            alias = subStr;
            //  Remove quotes, if any.
            if ((subStr.startsWith("'") && subStr.endsWith("'")) ||
                (subStr.startsWith('"') && subStr.endsWith('"')) ||
                (subStr.startsWith('[') && subStr.endsWith(']')))
                alias = subStr.substring(1, subStr.length - 1);

            //  Remove everything after 'AS'.
            realName = item.substring(0, lastAs);
        }
    }

    return [realName, alias];
}

function lastIndexOfOutsideLiteral(srcString, searchString) {
    let index = -1;
    let inQuote = "";

    for (let i = 0; i < srcString.length; i++) {
        const ch = srcString.charAt(i);

        if (inQuote !== "") {
            //  The ending quote.
            if ((inQuote === "'" && ch === "'") || (inQuote === '"' && ch === '"') || (inQuote === "[" && ch === "]"))
                inQuote = "";
        }
        else if ("\"'[".indexOf(ch) !== -1) {
            //  The starting quote.
            inQuote = ch;
        }
        else if (srcString.substring(i).startsWith(searchString)) {
            //  Matched search.
            index = i;
        }
    }

    return index;
}

/*
 * LEXER & PARSER FOR SQL CONDITIONS
 * Inspired by https://github.com/DmitrySoshnikov/Essentials-of-interpretation
 */

// Constructor
function CondLexer(source) {
    this.source = source;
    this.cursor = 0;
    this.currentChar = "";
    this.startQuote = "";
    this.bracketCount = 0;

    this.readNextChar();
}

CondLexer.prototype = {
    constructor: CondLexer,

    // Read the next character (or return an empty string if cursor is at the end of the source)
    readNextChar: function () {
        if (typeof this.source !== 'string') {
            this.currentChar = "";
        }
        else {
            this.currentChar = this.source[this.cursor++] || "";
        }
    },

    // Determine the next token
    readNextToken: function () {
        if (/\w/.test(this.currentChar))
            return this.readWord();
        if (/["'`]/.test(this.currentChar))
            return this.readString();
        if (/[()]/.test(this.currentChar))
            return this.readGroupSymbol();
        if (/[!=<>]/.test(this.currentChar))
            return this.readOperator();
        if (/[\+\-*\/%]/.test(this.currentChar))
            return this.readMathOperator();
        if (this.currentChar === '?')
            return this.readBindVariable();

        if (this.currentChar === "") {
            return { type: 'eot', value: '' };
        }

        this.readNextChar();
        return { type: 'empty', value: '' };
    },

    readWord: function () {
        let tokenValue = "";
        this.bracketCount = 0;
        let insideQuotedString = false;
        this.startQuote = "";

        while (/./.test(this.currentChar)) {
            // Check if we are in a string
            insideQuotedString = this.isStartOrEndOfString(insideQuotedString);

            if (this.isFinishedWord(insideQuotedString))
                break;

            tokenValue += this.currentChar;
            this.readNextChar();
        }

        if (/^(AND|OR)$/i.test(tokenValue)) {
            return { type: 'logic', value: tokenValue.toUpperCase() };
        }

        if (/^(IN|IS|NOT|LIKE)$/i.test(tokenValue)) {
            return { type: 'operator', value: tokenValue.toUpperCase() };
        }

        return { type: 'word', value: tokenValue };
    },

    /**
     * 
     * @param {Boolean} insideQuotedString 
     * @returns {Boolean}
     */
    isStartOrEndOfString: function (insideQuotedString) {
        if (!insideQuotedString && /['"`]/.test(this.currentChar)) {
            this.startQuote = this.currentChar;

            return true;
        }
        else if (insideQuotedString && this.currentChar === this.startQuote) {
            //  End of quoted string.
            return false;
        }

        return insideQuotedString;
    },

    /**
     * 
     * @param {Boolean} insideQuotedString 
     * @returns {Boolean}
     */
    isFinishedWord: function (insideQuotedString) {
        if (insideQuotedString)
            return false;

        // Token is finished if there is a closing bracket outside a string and with no opening
        if (this.currentChar === ')' && this.bracketCount <= 0) {
            return true;
        }

        if (this.currentChar === '(') {
            this.bracketCount++;
        }
        else if (this.currentChar === ')') {
            this.bracketCount--;
        }

        // Token is finished if there is a operator symbol outside a string
        if (/[!=<>]/.test(this.currentChar)) {
            return true;
        }

        // Token is finished on the first space which is outside a string or a function
        return this.currentChar === ' ' && this.bracketCount <= 0;
    },

    readString: function () {
        let tokenValue = "";
        const quote = this.currentChar;

        tokenValue += this.currentChar;
        this.readNextChar();

        while (this.currentChar !== quote && this.currentChar !== "") {
            tokenValue += this.currentChar;
            this.readNextChar();
        }

        tokenValue += this.currentChar;
        this.readNextChar();

        // Handle this case : `table`.`column`
        if (this.currentChar === '.') {
            tokenValue += this.currentChar;
            this.readNextChar();
            tokenValue += this.readString().value;

            return { type: 'word', value: tokenValue };
        }

        return { type: 'string', value: tokenValue };
    },

    readGroupSymbol: function () {
        const tokenValue = this.currentChar;
        this.readNextChar();

        return { type: 'group', value: tokenValue };
    },

    readOperator: function () {
        let tokenValue = this.currentChar;
        this.readNextChar();

        if (/[=<>]/.test(this.currentChar)) {
            tokenValue += this.currentChar;
            this.readNextChar();
        }

        return { type: 'operator', value: tokenValue };
    },

    readMathOperator: function () {
        const tokenValue = this.currentChar;
        this.readNextChar();

        return { type: 'mathoperator', value: tokenValue };
    },

    readBindVariable: function () {
        const tokenValue = this.currentChar;
        this.readNextChar();

        return { type: 'bindVariable', value: tokenValue };
    },
};

// Constructor
function CondParser(source) {
    this.lexer = new CondLexer(source);
    this.currentToken = {};

    this.readNextToken();
}

CondParser.prototype = {
    constructor: CondParser,

    // Read the next token (skip empty tokens)
    readNextToken: function () {
        this.currentToken = this.lexer.readNextToken();
        while (this.currentToken.type === 'empty')
            this.currentToken = this.lexer.readNextToken();
        return this.currentToken;
    },

    // Wrapper function ; parse the source
    parseExpressionsRecursively: function () {
        return this.parseLogicalExpression();
    },

    // Parse logical expressions (AND/OR)
    parseLogicalExpression: function () {
        let leftNode = this.parseConditionExpression();

        while (this.currentToken.type === 'logic') {
            const logic = this.currentToken.value;
            this.readNextToken();

            const rightNode = this.parseConditionExpression();

            // If we are chaining the same logical operator, add nodes to existing object instead of creating another one
            if (typeof leftNode.logic !== 'undefined' && leftNode.logic === logic && typeof leftNode.terms !== 'undefined')
                leftNode.terms.push(rightNode);
            else {
                const terms = [leftNode, rightNode];
                leftNode = { 'logic': logic, 'terms': terms.slice(0) };
            }
        }

        return leftNode;
    },

    // Parse conditions ([word/string] [operator] [word/string])
    parseConditionExpression: function () {
        let leftNode = this.parseBaseExpression();

        if (this.currentToken.type === 'operator') {
            let operator = this.currentToken.value;
            this.readNextToken();

            // If there are 2 adjacent operators, join them with a space (exemple: IS NOT)
            if (this.currentToken.type === 'operator') {
                operator += ' ' + this.currentToken.value;
                this.readNextToken();
            }

            const rightNode = this.parseBaseExpression(operator);

            leftNode = { 'operator': operator, 'left': leftNode, 'right': rightNode };
        }

        return leftNode;
    },

    // Parse base items
    /**
     * 
     * @param {String} operator 
     * @returns {Object}
     */
    parseBaseExpression: function (operator = "") {
        let astNode = {};

        // If this is a word/string, return its value
        if (this.currentToken.type === 'word' || this.currentToken.type === 'string') {
            astNode = this.parseWordExpression();
        }
        // If this is a group, skip brackets and parse the inside
        else if (this.currentToken.type === 'group') {
            astNode = this.parseGroupExpression(operator);
        }
        else if (this.currentToken.type === 'bindVariable') {
            astNode = this.currentToken.value;
            this.readNextToken();
        }

        return astNode;
    },

    /**
     * 
     * @returns {Object}
     */
    parseWordExpression: function () {
        let astNode = this.currentToken.value;
        this.readNextToken();

        if (this.currentToken.type === 'mathoperator') {
            astNode += " " + this.currentToken.value;
            this.readNextToken();
            while ((this.currentToken.type === 'mathoperator' || this.currentToken.type === 'word') && this.currentToken.type !== 'eot') {
                astNode += " " + this.currentToken.value;
                this.readNextToken();
            }
        }

        return astNode;
    },

    /**
     * 
     * @param {String} operator 
     * @returns {Object}
     */
    parseGroupExpression: function (operator) {
        this.readNextToken();
        let astNode = this.parseExpressionsRecursively();

        const isSelectStatement = typeof astNode === "string" && astNode.toUpperCase() === 'SELECT';

        if (operator === 'IN' || isSelectStatement) {
            astNode = this.parseSelectIn(astNode, isSelectStatement);
        }
        else {
            //  Are we within brackets of mathematicl expression ?
            let inCurrentToken = this.currentToken;

            while (inCurrentToken.type !== 'group' && inCurrentToken.type !== 'eot') {
                this.readNextToken();
                if (inCurrentToken.type !== 'group') {
                    astNode += " " + inCurrentToken.value;
                }

                inCurrentToken = this.currentToken;
            }

        }

        this.readNextToken();

        return astNode;
    },

    /**
     * 
     * @param {Object} startAstNode 
     * @param {Boolean} isSelectStatement 
     * @returns {Object}
     */
    parseSelectIn: function (startAstNode, isSelectStatement) {
        let astNode = startAstNode;
        let inCurrentToken = this.currentToken;
        while (inCurrentToken.type !== 'group' && inCurrentToken.type !== 'eot') {
            this.readNextToken();
            if (inCurrentToken.type !== 'group') {
                if (isSelectStatement)
                    astNode += " " + inCurrentToken.value;
                else
                    astNode += ", " + inCurrentToken.value;
            }

            inCurrentToken = this.currentToken;
        }

        if (isSelectStatement) {
            astNode = sql2ast(astNode);
        }

        return astNode;
    }

};

// Parse a string
CondParser.parse = function (source) {
    return new CondParser(source).parseExpressionsRecursively();
};

/**
* 
* @param {String} logic 
* @param {Object} terms 
* @returns {String}
*/
function resolveSqlCondition(logic, terms) {
    let jsCondition = "";

    for (const cond of terms) {
        if (typeof cond.logic === 'undefined') {
            if (jsCondition !== "" && logic === "AND") {
                jsCondition += " && ";
            }
            else if (jsCondition !== "" && logic === "OR") {
                jsCondition += " || ";
            }

            jsCondition += " " + cond.left;
            if (cond.operator === "=")
                jsCondition += " == ";
            else
                jsCondition += " " + cond.operator;
            jsCondition += " " + cond.right;
        }
        else {
            jsCondition += resolveSqlCondition(cond.logic, cond.terms);
        }
    }

    return jsCondition;
}


function sqlCondition2JsCondition(cond) {
    const ast = sql2ast("SELECT A FROM c WHERE " + cond);
    let sqlData = "";

    if (typeof ast['WHERE'] !== 'undefined') {
        const conditions = ast['WHERE'];
        if (typeof conditions.logic === 'undefined')
            sqlData = resolveSqlCondition("OR", [conditions]);
        else
            sqlData = resolveSqlCondition(conditions.logic, conditions.terms);

    }

    return sqlData;
}
