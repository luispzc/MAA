namespace MAA.Core.Combat
{
    /// <summary>
    /// Generador mulberry32, idéntico a src/core/combat/rng.ts: misma semilla,
    /// misma secuencia que la versión web.
    /// </summary>
    public sealed class Rng
    {
        public int State;

        public Rng(int seed) { State = seed; }

        public double Next()
        {
            unchecked
            {
                State += 0x6D2B79F5;
                uint t = (uint)State;
                t = (t ^ (t >> 15)) * (t | 1);
                t ^= t + (t ^ (t >> 7)) * (t | 61);
                return (t ^ (t >> 14)) / 4294967296.0;
            }
        }
    }
}
