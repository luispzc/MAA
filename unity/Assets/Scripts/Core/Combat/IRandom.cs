namespace MAA.Core.Combat
{
    /// <summary>Fuente de azar inyectable para poder repetir combates en pruebas.</summary>
    public interface IRandom
    {
        /// <summary>Número en [0, 1).</summary>
        double NextDouble();
    }

    public sealed class SystemRandom : IRandom
    {
        private readonly System.Random _random;

        public SystemRandom(int? seed = null)
        {
            _random = seed.HasValue ? new System.Random(seed.Value) : new System.Random();
        }

        public double NextDouble() => _random.NextDouble();
    }
}
