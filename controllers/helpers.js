exports.getLocaleDateTime = () => {
    return new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' });
}
